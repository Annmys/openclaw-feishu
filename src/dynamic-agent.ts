import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { OpenClawConfig, PluginRuntime } from "openclaw/plugin-sdk";
import type { DynamicAgentCreationConfig } from "./types.js";
import { loadIdentityMap, getUserInfo } from "./identity.js";

export type MaybeCreateDynamicAgentResult = {
  created: boolean;
  updatedCfg: OpenClawConfig;
  agentId?: string;
};

/**
 * 生成用户友好的Agent ID
 * 格式: feishu-用户名
 * 示例: feishu-Bella, feishu-aa1
 * 
 * 注意：此方案假设团队中不会有重名用户
 */
function generateAgentId(
  openId: string,
  identityMapPath?: string
): string {
  // 尝试从身份表获取用户姓名
  let userName: string | null = null;
  
  if (identityMapPath) {
    try {
      const identityMap = loadIdentityMap(identityMapPath);
      if (identityMap) {
        const user = getUserInfo(identityMap, openId);
        if (user?.name) {
          userName = user.name;
        }
      }
    } catch {
      // 忽略加载错误
    }
  }

  if (userName) {
    // 清理姓名中的特殊字符，确保文件系统安全
    const safeName = userName
      .replace(/[^\w\-\u4e00-\u9fa5]/g, "") // 保留字母数字、横线、中文
      .slice(0, 20); // 限制长度
    
    return `feishu-${safeName}`;
  }

  // 没有姓名时使用OpenID（去掉ou_前缀）
  return `feishu-${openId.replace(/^ou_/, "")}`;
}

/**
 * Check if a dynamic agent should be created for a DM user and create it if needed.
 * This creates a unique agent instance with its own workspace for each DM user.
 */
export async function maybeCreateDynamicAgent(params: {
  cfg: OpenClawConfig;
  runtime: PluginRuntime;
  senderOpenId: string;
  dynamicCfg: DynamicAgentCreationConfig;
  log: (msg: string) => void;
  identityMapPath?: string;
}): Promise<MaybeCreateDynamicAgentResult> {
  const { cfg, runtime, senderOpenId, dynamicCfg, log, identityMapPath } = params;

  // Check if there's already a binding for this user
  const existingBindings = cfg.bindings ?? [];
  const hasBinding = existingBindings.some(
    (b) =>
      b.match?.channel === "feishu" &&
      b.match?.peer?.kind === "dm" &&
      b.match?.peer?.id === senderOpenId,
  );

  if (hasBinding) {
    return { created: false, updatedCfg: cfg };
  }

  // Check maxAgents limit if configured
  if (dynamicCfg.maxAgents !== undefined) {
    const feishuAgentCount = (cfg.agents?.list ?? []).filter((a) =>
      a.id.startsWith("feishu-"),
    ).length;
    if (feishuAgentCount >= dynamicCfg.maxAgents) {
      log(
        `feishu: maxAgents limit (${dynamicCfg.maxAgents}) reached, not creating agent for ${senderOpenId}`,
      );
      return { created: false, updatedCfg: cfg };
    }
  }

  // 生成用户友好的Agent ID
  const agentId = generateAgentId(senderOpenId, identityMapPath);

  // Check if agent already exists (but binding was missing)
  const existingAgent = (cfg.agents?.list ?? []).find((a) => a.id === agentId);
  if (existingAgent) {
    // Agent exists but binding doesn't - just add the binding
    log(`feishu: agent "${agentId}" exists, adding missing binding for ${senderOpenId}`);

    const updatedCfg: OpenClawConfig = {
      ...cfg,
      bindings: [
        ...existingBindings,
        {
          agentId,
          match: {
            channel: "feishu",
            peer: { kind: "dm", id: senderOpenId },
          },
        },
      ],
    };

    await runtime.config.writeConfigFile(updatedCfg);
    return { created: true, updatedCfg, agentId };
  }

  // Resolve path templates with substitutions
  const workspaceTemplate = dynamicCfg.workspaceTemplate ?? "~/.openclaw/workspace-{agentId}";
  const agentDirTemplate = dynamicCfg.agentDirTemplate ?? "~/.openclaw/agents/{agentId}/agent";

  const workspace = resolveUserPath(
    workspaceTemplate.replace("{userId}", senderOpenId).replace("{agentId}", agentId),
  );
  const agentDir = resolveUserPath(
    agentDirTemplate.replace("{userId}", senderOpenId).replace("{agentId}", agentId),
  );

  log(`feishu: creating dynamic agent "${agentId}" for user ${senderOpenId}`);
  log(`  workspace: ${workspace}`);
  log(`  agentDir: ${agentDir}`);

  // Create directories
  await fs.promises.mkdir(workspace, { recursive: true });
  await fs.promises.mkdir(agentDir, { recursive: true });

  // Update configuration with new agent and binding
  const updatedCfg: OpenClawConfig = {
    ...cfg,
    agents: {
      ...cfg.agents,
      list: [...(cfg.agents?.list ?? []), { id: agentId, workspace, agentDir }],
    },
    bindings: [
      ...existingBindings,
      {
        agentId,
        match: {
          channel: "feishu",
          peer: { kind: "dm", id: senderOpenId },
        },
      },
    ],
  };

  // Write updated config using PluginRuntime API
  await runtime.config.writeConfigFile(updatedCfg);

  return { created: true, updatedCfg, agentId };
}

/**
 * Resolve a path that may start with ~ to the user's home directory.
 */
function resolveUserPath(p: string): string {
  if (p.startsWith("~/")) {
    return path.join(os.homedir(), p.slice(2));
  }
  return p;
}
