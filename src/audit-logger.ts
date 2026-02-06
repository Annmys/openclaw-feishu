/**
 * 审计日志模块
 * 记录所有敏感操作，支持导出报表
 */

import fs from "node:fs";
import path from "node:path";

export type AuditEventType = 
  | "permission_request"      // 权限请求
  | "permission_approved"     // 权限批准
  | "permission_denied"       // 权限拒绝
  | "identity_claim"          // 身份声明
  | "identity_verified"       // 身份验证
  | "task_completed"          // 任务完成
  | "task_failed"             // 任务失败
  | "sensitive_operation"     // 敏感操作
  | "config_changed"          // 配置变更
  | "file_accessed"           // 文件访问
  | "message_sent";           // 消息发送

export interface AuditEvent {
  id: string;                 // 事件ID
  timestamp: string;          // ISO 8601 时间戳
  eventType: AuditEventType;  // 事件类型
  userId: string;             // 用户ID
  userName: string;           // 用户名称
  userLevel: string;          // 用户权限等级
  source: string;             // 来源（飞书私聊/群聊）
  details: string;            // 详细信息
  success: boolean;           // 是否成功
  errorMessage?: string;      // 错误信息（如失败）
  metadata?: Record<string, any>;  // 额外元数据
}

export interface AuditLogConfig {
  logDir?: string;            // 日志目录
  maxDays?: number;           // 保留天数（默认30天）
  enableConsole?: boolean;    // 是否输出到控制台
}

export class AuditLogger {
  private config: AuditLogConfig;
  private logDir: string;
  private currentDate: string = "";
  private currentFilePath: string = "";

  constructor(config: AuditLogConfig = {}) {
    this.config = {
      maxDays: 30,
      enableConsole: true,
      ...config,
    };

    this.logDir = this.config.logDir || 
      path.join(process.env.HOME || "", ".openclaw/workspace/logs/audit");
    
    // 确保日志目录存在
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }

    this.updateCurrentFile();
    this.cleanOldLogs();
  }

  /**
   * 记录审计事件
   */
  log(event: Omit<AuditEvent, "id" | "timestamp">): AuditEvent {
    const auditEvent: AuditEvent = {
      ...event,
      id: this.generateEventId(),
      timestamp: new Date().toISOString(),
    };

    // 检查是否需要切换日志文件（日期变化）
    this.updateCurrentFile();

    // 写入日志文件
    this.writeToFile(auditEvent);

    // 输出到控制台
    if (this.config.enableConsole) {
      console.log(`[Audit] ${auditEvent.eventType} | ${auditEvent.userName} | ${auditEvent.details}`);
    }

    return auditEvent;
  }

  /**
   * 记录权限请求
   */
  logPermissionRequest(
    userId: string,
    userName: string,
    userLevel: string,
    operation: string,
    source: string,
    details?: string
  ): AuditEvent {
    return this.log({
      eventType: "permission_request",
      userId,
      userName,
      userLevel,
      source,
      details: details || `请求操作: ${operation}`,
      success: true,
      metadata: { operation },
    });
  }

  /**
   * 记录权限审批结果
   */
  logPermissionApproval(
    userId: string,
    userName: string,
    userLevel: string,
    operation: string,
    approved: boolean,
    source: string,
    reason?: string
  ): AuditEvent {
    return this.log({
      eventType: approved ? "permission_approved" : "permission_denied",
      userId,
      userName,
      userLevel,
      source,
      details: approved 
        ? `批准操作: ${operation}`
        : `拒绝操作: ${operation}${reason ? `, 原因: ${reason}` : ""}`,
      success: approved,
      metadata: { operation, approved, reason },
    });
  }

  /**
   * 记录任务完成
   */
  logTaskCompleted(
    userId: string,
    userName: string,
    userLevel: string,
    taskType: string,
    description: string,
    outputPath?: string
  ): AuditEvent {
    return this.log({
      eventType: "task_completed",
      userId,
      userName,
      userLevel,
      source: "task_execution",
      details: description,
      success: true,
      metadata: { taskType, outputPath },
    });
  }

  /**
   * 记录敏感操作
   */
  logSensitiveOperation(
    userId: string,
    userName: string,
    userLevel: string,
    operation: string,
    source: string,
    success: boolean,
    errorMessage?: string
  ): AuditEvent {
    return this.log({
      eventType: "sensitive_operation",
      userId,
      userName,
      userLevel,
      source,
      details: `敏感操作: ${operation}`,
      success,
      errorMessage,
      metadata: { operation },
    });
  }

  /**
   * 查询审计日志
   */
  query(options: {
    startDate?: Date;
    endDate?: Date;
    userId?: string;
    eventType?: AuditEventType;
    limit?: number;
  } = {}): AuditEvent[] {
    const { startDate, endDate, userId, eventType, limit = 100 } = options;
    const results: AuditEvent[] = [];

    // 读取所有日志文件
    const files = fs.readdirSync(this.logDir)
      .filter(f => f.endsWith(".jsonl"))
      .sort();

    for (const file of files) {
      if (results.length >= limit) break;

      const filePath = path.join(this.logDir, file);
      const content = fs.readFileSync(filePath, "utf-8");
      const lines = content.split("\n").filter(Boolean);

      for (const line of lines) {
        if (results.length >= limit) break;

        try {
          const event: AuditEvent = JSON.parse(line);

          // 过滤条件
          if (startDate && new Date(event.timestamp) < startDate) continue;
          if (endDate && new Date(event.timestamp) > endDate) continue;
          if (userId && event.userId !== userId) continue;
          if (eventType && event.eventType !== eventType) continue;

          results.push(event);
        } catch {
          // 忽略解析错误的行
        }
      }
    }

    return results;
  }

  /**
   * 导出报表（CSV格式）
   */
  exportToCSV(options: {
    startDate?: Date;
    endDate?: Date;
    userId?: string;
  } = {}): string {
    const events = this.query(options);
    
    // CSV 表头
    const headers = ["时间", "事件类型", "用户", "权限等级", "来源", "详情", "结果"];
    
    // CSV 行
    const rows = events.map(e => [
      e.timestamp,
      e.eventType,
      e.userName,
      e.userLevel,
      e.source,
      `"${e.details.replace(/"/g, '""')}"`,  // 转义双引号
      e.success ? "成功" : "失败",
    ]);

    return [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
  }

  /**
   * 获取统计信息
   */
  getStats(options: {
    startDate?: Date;
    endDate?: Date;
  } = {}): {
    totalEvents: number;
    eventsByType: Record<AuditEventType, number>;
    eventsByUser: Record<string, number>;
    successRate: number;
  } {
    const events = this.query({ ...options, limit: 10000 });
    
    const eventsByType: Record<string, number> = {};
    const eventsByUser: Record<string, number> = {};
    let successCount = 0;

    for (const event of events) {
      eventsByType[event.eventType] = (eventsByType[event.eventType] || 0) + 1;
      eventsByUser[event.userName] = (eventsByUser[event.userName] || 0) + 1;
      if (event.success) successCount++;
    }

    return {
      totalEvents: events.length,
      eventsByType: eventsByType as Record<AuditEventType, number>,
      eventsByUser,
      successRate: events.length > 0 ? successCount / events.length : 0,
    };
  }

  /**
   * 生成事件ID
   */
  private generateEventId(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 更新当前日志文件路径
   */
  private updateCurrentFile(): void {
    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    if (today !== this.currentDate) {
      this.currentDate = today;
      this.currentFilePath = path.join(this.logDir, `${today}.jsonl`);
    }
  }

  /**
   * 写入日志文件
   */
  private writeToFile(event: AuditEvent): void {
    const line = JSON.stringify(event) + "\n";
    fs.appendFileSync(this.currentFilePath, line, "utf-8");
  }

  /**
   * 清理旧日志
   */
  private cleanOldLogs(): void {
    const maxAgeMs = (this.config.maxDays || 30) * 24 * 60 * 60 * 1000;
    const now = Date.now();

    const files = fs.readdirSync(this.logDir);
    for (const file of files) {
      const filePath = path.join(this.logDir, file);
      const stats = fs.statSync(filePath);
      
      if (now - stats.mtime.getTime() > maxAgeMs) {
        fs.unlinkSync(filePath);
        console.log(`[AuditLogger] 清理旧日志: ${file}`);
      }
    }
  }
}

// 全局单例
let globalAuditLogger: AuditLogger | null = null;

/**
 * 获取全局审计日志记录器
 */
export function getGlobalAuditLogger(config?: AuditLogConfig): AuditLogger {
  if (!globalAuditLogger) {
    globalAuditLogger = new AuditLogger(config);
  }
  return globalAuditLogger;
}
