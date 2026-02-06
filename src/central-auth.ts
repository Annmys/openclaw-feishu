/**
 * 中央权限管理器
 * 整合身份验证、权限检查、任务汇报功能
 */

import path from "node:path";
import type { OpenClawConfig } from "openclaw/plugin-sdk";
import type { PluginRuntime } from "openclaw/plugin-sdk";
import {
  loadIdentityMap,
  getUserLevel,
  getUserInfo,
  isNewUser,
  extractIdentityClaim,
  handleIdentityClaim,
  getUserDisplayName,
  shortenOpenId,
  type IdentityMap,
  type VerifiedUser,
  type PendingVerification,
} from "./identity.js";
import {
  checkPermission,
  isSensitiveOperation,
  getPermissionDeniedMessage,
  detectOperationType,
  type OperationType,
} from "./gatekeeper.js";
import {
  formatTaskReport,
  formatMasterNotification,
  shouldReportToGroup,
  buildForwardToMasterMessage,
  type TaskReport,
} from "./reporter.js";
import { sendMessageFeishu } from "./send.js";
import type { ResolvedFeishuAccount } from "./types.js";

export interface CentralAuthConfig {
  /** 身份映射表路径 */
  identityMapPath?: string;
  /** 主控会话Key */
  masterSessionKey: string;
  /** 汇报群ID */
  reportGroupId?: string;
  /** 是否启用自动身份确认 */
  enableAutoConfirm: boolean;
  /** 飞书账号配置（用于API调用获取用户姓名） */
  feishuAccount?: ResolvedFeishuAccount;
}

/**
 * 权限请求状态
 */
interface PendingPermissionRequest {
  requestId: string;
  openId: string;
  userName: string;
  userLevel: string;
  operation: OperationType;
  originalMessage: string;
  sourceChannel: string;
  groupId?: string;
  timestamp: number;
}

export class CentralAuthManager {
  private identityMap: IdentityMap | null = null;
  private config: CentralAuthConfig;
  private runtime: PluginRuntime;
  private pendingRequests: Map<string, PendingPermissionRequest> = new Map();

  constructor(config: CentralAuthConfig, runtime: PluginRuntime) {
    this.config = {
      enableAutoConfirm: true,
      ...config,
    };
    this.runtime = runtime;
    this.loadIdentityMap();
  }

  /**
   * 加载身份映射表
   */
  private loadIdentityMap(): void {
    const identityPath = this.config.identityMapPath || 
      path.join(process.env.HOME || "", ".openclaw/workspace/rules/feishu-identity.yaml");
    
    this.identityMap = loadIdentityMap(identityPath);
  }

  /**
   * 重新加载身份映射表（热更新）
   */
  reloadIdentityMap(): void {
    this.loadIdentityMap();
  }

  /**
   * 获取用户信息
   */
  getUser(openId: string): VerifiedUser | null {
    return getUserInfo(this.identityMap, openId);
  }

  /**
   * 获取用户权限等级
   */
  getUserLevel(openId: string): string {
    return getUserLevel(this.identityMap, openId);
  }

  /**
   * 检查是否为新用户
   */
  isNewUser(openId: string): boolean {
    return isNewUser(this.identityMap, openId);
  }

  /**
   * 处理用户消息前的身份和权限检查
   * 返回: 是否继续处理消息、回复消息、是否转发主控
   */
  async handleIncomingMessage(params: {
    openId: string;
    message: string;
    isGroup: boolean;
    groupId?: string;
    account?: ResolvedFeishuAccount;
  }): Promise<{
    shouldProcess: boolean;
    reply?: string;
    forwardToMaster?: boolean;
    forwardMessage?: string;
    requestId?: string;
  }> {
    const { openId, message, isGroup, groupId, account } = params;

    // 1. 检查身份声明
    const identityClaim = extractIdentityClaim(message);
    if (identityClaim && this.identityMap) {
      const result = handleIdentityClaim(this.identityMap, openId, identityClaim);
      
      if (result.autoConfirmed && result.existingUser) {
        // 自动确认成功
        return {
          shouldProcess: true,
          reply: result.message,
        };
      } else if (!result.autoConfirmed) {
        // 需要人工确认，转发主控
        const userInfo = getUserInfo(this.identityMap, openId);
        const displayName = await this.getDisplayName(openId, account);
        
        // 添加到待验证列表
        const requestId = this.addPendingVerification({
          openId,
          claimedName: identityClaim,
          channel: isGroup ? `group:${groupId}` : "dm",
        });
        
        return {
          shouldProcess: false,
          reply: result.message,
          forwardToMaster: true,
          forwardMessage: formatMasterNotification({
            type: "identity_claim",
            source: isGroup ? `飞书群:${groupId}` : "飞书私聊",
            requesterId: openId,
            requesterName: identityClaim,
            requesterLevel: "L0",
            details: `声称身份: ${identityClaim}\n自动分配ID: ${requestId}`,
          }),
          requestId,
        };
      }
    }

    // 2. 检查用户权限
    const userLevel = this.getUserLevel(openId);
    const userInfo = this.getUser(openId);

    if (userLevel === "L0" && !identityClaim) {
      // 未登记用户且非身份声明
      return {
        shouldProcess: false,
        reply: "请先私聊大A进行身份登记，完成后即可正常使用。\n\n发送「我是XXX」可开始登记流程。",
      };
    }

    // 3. 检查操作权限
    const operationType = detectOperationType(message);
    const hasPermission = checkPermission(
      userLevel as any,
      operationType,
      false,
      false
    );

    if (!hasPermission && isSensitiveOperation(operationType)) {
      // 敏感操作无权限，转发主控
      const displayName = await this.getDisplayName(openId, account);
      const requestId = this.addPendingPermissionRequest({
        openId,
        userName: displayName,
        userLevel,
        operation: operationType,
        originalMessage: message,
        sourceChannel: isGroup ? `飞书群:${groupId}` : "飞书私聊",
        groupId,
      });
      
      return {
        shouldProcess: false,
        reply: getPermissionDeniedMessage(userLevel as any, operationType),
        forwardToMaster: true,
        forwardMessage: formatMasterNotification({
          type: "permission_request",
          source: isGroup ? `飞书群:${groupId}` : "飞书私聊",
          requesterId: openId,
          requesterName: displayName,
          requesterLevel: userLevel,
          details: `请求操作: ${operationType}\n消息内容: ${message.slice(0, 100)}\n处理ID: ${requestId}`,
        }),
        requestId,
      };
    }

    // 4. 群聊敏感操作拦截
    if (isGroup && isSensitiveOperation(operationType)) {
      return {
        shouldProcess: false,
        reply: "群里禁止操作，请私聊我处理，谢谢配合！",
      };
    }

    // 通过所有检查，继续处理
    return { shouldProcess: true };
  }

  /**
   * 添加待处理的身份验证
   */
  private addPendingVerification(params: {
    openId: string;
    claimedName: string;
    channel: string;
  }): string {
    const requestId = `verify_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    // 存储到 identityMap 的 pending_verifications
    // 实际实现需要保存到文件
    return requestId;
  }

  /**
   * 添加待处理的权限请求
   */
  private addPendingPermissionRequest(params: Omit<PendingPermissionRequest, "requestId" | "timestamp">): string {
    const requestId = `perm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const request: PendingPermissionRequest = {
      ...params,
      requestId,
      timestamp: Date.now(),
    };
    this.pendingRequests.set(requestId, request);
    return requestId;
  }

  /**
   * 获取待处理的权限请求
   */
  getPendingRequest(requestId: string): PendingPermissionRequest | undefined {
    return this.pendingRequests.get(requestId);
  }

  /**
   * 列出所有待处理的权限请求
   */
  listPendingRequests(): PendingPermissionRequest[] {
    return Array.from(this.pendingRequests.values());
  }

  /**
   * 处理权限审批（由主控调用）
   * @param requestId 请求ID
   * @param approved 是否批准
   * @param reason 拒绝原因（如拒绝）
   */
  async handlePermissionApproval(
    requestId: string,
    approved: boolean,
    reason?: string
  ): Promise<{
    success: boolean;
    message: string;
    request?: PendingPermissionRequest;
  }> {
    const request = this.pendingRequests.get(requestId);
    if (!request) {
      return {
        success: false,
        message: `未找到请求: ${requestId}`,
      };
    }

    // 从待处理列表中移除
    this.pendingRequests.delete(requestId);

    if (approved) {
      // 批准：通知用户可以执行操作
      // 实际实现需要记录授权状态，允许用户再次执行该操作
      return {
        success: true,
        message: `已批准 ${request.userName} 的 ${request.operation} 请求`,
        request,
      };
    } else {
      // 拒绝：通知用户
      return {
        success: true,
        message: `已拒绝 ${request.userName} 的请求${reason ? `: ${reason}` : ""}`,
        request,
      };
    }
  }

  /**
   * 发送任务汇报到主控
   */
  async reportToMaster(report: TaskReport): Promise<void> {
    const formattedReport = formatTaskReport(report);
    
    // 使用 sessions_send 发送到主控
    try {
      // 动态导入 sessions_send，避免循环依赖
      const { sessionsSend } = await import("./sessions-bridge.js");
      
      await sessionsSend({
        sessionKey: this.config.masterSessionKey,
        message: formattedReport,
      });
      
      console.log("[Report to Master] Success:", report.taskType);
    } catch (error) {
      console.error("[Report to Master] Failed:", error);
      // 失败时记录到日志，稍后重试
    }
  }

  /**
   * 发送任务汇报到群组
   */
  async reportToGroup(report: TaskReport): Promise<void> {
    if (!shouldReportToGroup(report.userLevel)) {
      return; // L1 不需要汇报
    }

    if (!this.config.reportGroupId) {
      console.log("[Report to Group] Skip: no reportGroupId configured");
      return;
    }

    const formattedReport = formatTaskReport(report);
    
    try {
      // 使用飞书 API 发送到汇报群
      await sendMessageFeishu({
        cfg: { channels: { feishu: { appId: "", appSecret: "" } } } as any,
        to: `chat:${this.config.reportGroupId}`,
        text: formattedReport,
        accountId: "default",
      });
      
      console.log("[Report to Group] Success:", this.config.reportGroupId);
    } catch (error) {
      console.error("[Report to Group] Failed:", error);
    }
  }

  /**
   * 转发消息到主控
   */
  async forwardToMaster(params: {
    message: string;
    openId: string;
    sourceChannel: string;
    account?: ResolvedFeishuAccount;
  }): Promise<void> {
    const userInfo = this.getUser(params.openId);
    const userLevel = this.getUserLevel(params.openId);
    
    // 优先使用身份表中的姓名，如果没有则尝试从飞书API获取
    let displayName = userInfo?.name;
    if (!displayName && params.account) {
      displayName = await getUserDisplayName(this.identityMap, params.openId, params.account);
    }
    
    const forwardMessage = buildForwardToMasterMessage(
      params.message,
      {
        openId: params.openId,
        name: displayName || "未知",
        level: userLevel,
      },
      params.sourceChannel
    );

    // 使用 sessions_send 发送到主控
    try {
      const { sessionsSend } = await import("./sessions-bridge.js");
      
      await sessionsSend({
        sessionKey: this.config.masterSessionKey,
        message: forwardMessage,
      });
      
      console.log("[Forward to Master] Success");
    } catch (error) {
      console.error("[Forward to Master] Failed:", error);
    }
  }

  /**
   * 获取用户显示名称（优先使用身份表，其次飞书API）
   */
  async getDisplayName(openId: string, account?: ResolvedFeishuAccount): Promise<string> {
    return getUserDisplayName(this.identityMap, openId, account);
  }
}

/**
 * 创建中央权限管理器实例
 */
export function createCentralAuth(
  config: CentralAuthConfig,
  runtime: PluginRuntime
): CentralAuthManager {
  return new CentralAuthManager(config, runtime);
}
