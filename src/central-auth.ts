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
  feishuAccount?: any; // ResolvedFeishuAccount
}

export class CentralAuthManager {
  private identityMap: IdentityMap | null = null;
  private config: CentralAuthConfig;
  private runtime: PluginRuntime;

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
  }): Promise<{
    shouldProcess: boolean;
    reply?: string;
    forwardToMaster?: boolean;
    forwardMessage?: string;
  }> {
    const { openId, message, isGroup, groupId } = params;

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
            details: `声称身份: ${identityClaim}`,
          }),
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
      false, // TODO: 判断是否为部门资源
      false  // TODO: 判断是否为本部门
    );

    if (!hasPermission && isSensitiveOperation(operationType)) {
      // 敏感操作无权限，转发主控
      return {
        shouldProcess: false,
        reply: getPermissionDeniedMessage(userLevel as any, operationType),
        forwardToMaster: true,
        forwardMessage: formatMasterNotification({
          type: "permission_request",
          source: isGroup ? `飞书群:${groupId}` : "飞书私聊",
          requesterId: openId,
          requesterName: userInfo?.name || "未知",
          requesterLevel: userLevel,
          details: `请求操作: ${operationType}\n消息内容: ${message.slice(0, 100)}`,
        }),
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
   * 发送任务汇报到主控
   */
  async reportToMaster(report: TaskReport): Promise<void> {
    const formattedReport = formatTaskReport(report);
    
    // TODO: 使用 sessions_send 发送到主控
    // 这里需要根据 OpenClaw 的 API 实现
    console.log("[Report to Master]", formattedReport);
  }

  /**
   * 发送任务汇报到群组
   */
  async reportToGroup(report: TaskReport): Promise<void> {
    if (!shouldReportToGroup(report.userLevel)) {
      return; // L1 不需要汇报
    }

    const formattedReport = formatTaskReport(report);
    
    // TODO: 使用飞书 API 发送到汇报群
    console.log("[Report to Group]", formattedReport);
  }

  /**
   * 转发消息到主控
   */
  async forwardToMaster(params: {
    message: string;
    openId: string;
    sourceChannel: string;
    account?: any; // ResolvedFeishuAccount
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

    // TODO: 使用 sessions_send 发送到主控
    console.log("[Forward to Master]", forwardMessage);
  }

  /**
   * 获取用户显示名称（优先使用身份表，其次飞书API）
   */
  async getDisplayName(openId: string, account?: any): Promise<string> {
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
