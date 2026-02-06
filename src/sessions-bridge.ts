/**
 * OpenClaw 会话桥接模块
 * 用于与 OpenClaw 核心功能交互
 */

import type { PluginRuntime } from "openclaw/plugin-sdk";

interface SessionsSendOptions {
  sessionKey: string;
  message: string;
  timeoutSeconds?: number;
}

interface SessionsSendResult {
  success: boolean;
  error?: string;
}

/**
 * 发送消息到指定会话
 * 包装 OpenClaw 的 sessions_send 功能
 */
export async function sessionsSend(
  options: SessionsSendOptions
): Promise<SessionsSendResult> {
  const { sessionKey, message, timeoutSeconds = 300 } = options;

  try {
    // 尝试通过多种方式调用 sessions_send
    
    // 方式1: 通过全局运行时（如果在插件上下文中）
    if (typeof globalThis !== "undefined" && (globalThis as any).__openclaw_runtime) {
      const runtime = (globalThis as any).__openclaw_runtime;
      if (runtime.sessions?.send) {
        await runtime.sessions.send({
          sessionKey,
          message,
          timeoutSeconds,
        });
        return { success: true };
      }
    }

    // 方式2: 通过 process.env 获取运行时
    if (process.env.OPENCLAW_RUNTIME) {
      const runtime = JSON.parse(process.env.OPENCLAW_RUNTIME);
      if (runtime.sessionsSend) {
        await runtime.sessionsSend(sessionKey, message, timeoutSeconds);
        return { success: true };
      }
    }

    // 方式3: 使用 exec 调用 openclaw CLI
    // 注意：这种方式有性能开销，仅作为 fallback
    const { execSync } = await import("child_process");
    const result = execSync(
      `openclaw sessions send "${sessionKey}" "${message.replace(/"/g, '\\"')}"`,
      { encoding: "utf-8", timeout: timeoutSeconds * 1000 }
    );
    
    return { success: true };
  } catch (error) {
    console.error("[sessionsSend] Error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * 获取会话历史
 */
export async function sessionsHistory(
  sessionKey: string,
  limit: number = 50
): Promise<any[]> {
  try {
    // 通过 CLI 获取历史
    const { execSync } = await import("child_process");
    const result = execSync(
      `openclaw sessions history "${sessionKey}" --limit ${limit} --json`,
      { encoding: "utf-8" }
    );
    
    return JSON.parse(result);
  } catch (error) {
    console.error("[sessionsHistory] Error:", error);
    return [];
  }
}

/**
 * 列出现有会话
 */
export async function sessionsList(
  options: {
    kinds?: string[];
    activeMinutes?: number;
    limit?: number;
  } = {}
): Promise<any[]> {
  const { kinds, activeMinutes = 60, limit = 50 } = options;
  
  try {
    let cmd = `openclaw sessions list --json --limit ${limit} --active-minutes ${activeMinutes}`;
    if (kinds?.length) {
      cmd += ` --kinds ${kinds.join(",")}`;
    }
    
    const { execSync } = await import("child_process");
    const result = execSync(cmd, { encoding: "utf-8" });
    
    return JSON.parse(result);
  } catch (error) {
    console.error("[sessionsList] Error:", error);
    return [];
  }
}

/**
 * 初始化运行时桥接
 * 应在插件加载时调用
 */
export function initSessionsBridge(runtime?: PluginRuntime): void {
  if (runtime) {
    // 将运行时存储到全局，供后续使用
    (globalThis as any).__openclaw_runtime = runtime;
  }
}
