/**
 * 任务汇报模块
 * 用于向主控Agent发送任务汇报
 */

export interface TaskReport {
  source: string;        // 来源会话
  userId: string;        // 用户ID
  userName: string;      // 用户名字
  userLevel: string;     // 权限等级
  taskType: string;      // 任务类型
  status: "success" | "failed" | "pending";
  description: string;   // 任务简述
  outputPath?: string;   // 输出文件路径
  error?: string;        // 错误信息
}

/**
 * 格式化任务汇报（三行格式）
 */
export function formatTaskReport(report: TaskReport): string {
  const statusEmoji = report.status === "success" ? "✅" : 
                      report.status === "failed" ? "❌" : "⏳";
  const statusText = report.status === "success" ? "成功" : 
                     report.status === "failed" ? "失败" : "进行中";
  
  const output = report.outputPath || "无";
  
  return `${statusEmoji}[${report.userName}] [${statusText}]
📝 ${report.description}
📎 输出文件:${output}`;
}

/**
 * 格式化主控通知（权限请求等）
 */
export function formatMasterNotification(params: {
  type: "permission_request" | "identity_claim" | "error";
  source: string;
  requesterId: string;
  requesterName: string;
  requesterLevel: string;
  details: string;
}): string {
  const { type, source, requesterId, requesterName, requesterLevel, details } = params;
  
  const typeLabels: Record<string, string> = {
    permission_request: "🚨 权限请求",
    identity_claim: "👤 身份声明",
    error: "⚠️ 错误通知",
  };
  
  return `${typeLabels[type]}

来源: ${source}
请求人: ${requesterName} (${requesterLevel})
ID: ${requesterId}

详情: ${details}

[✅ 授权执行] [❌ 拒绝] [📝 询问详情]`;
}

/**
 * 判断是否需要发群汇报
 * 规则：除L1（大A）外，任何人任务完成后必须发群汇报
 */
export function shouldReportToGroup(userLevel: string): boolean {
  return userLevel !== "L1";
}

/**
 * 构建转发到主控的消息
 */
export function buildForwardToMasterMessage(
  originalMessage: string,
  userInfo: {
    openId: string;
    name: string;
    level: string;
  },
  sourceChannel: string
): string {
  return `【转发 - 需主控处理】

来源: ${sourceChannel}
用户: ${userInfo.name} (${userInfo.level})
ID: ${userInfo.openId}

消息内容:
${originalMessage}`;
}
