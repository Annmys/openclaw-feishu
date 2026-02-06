import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { createFeishuClient } from "./client.js";
import type { ResolvedFeishuAccount } from "./types.js";

/**
 * 用户姓名缓存
 * 避免频繁调用飞书API
 */
const userNameCache = new Map<string, { name: string; expireAt: number }>();
const USER_NAME_TTL_MS = 10 * 60 * 1000; // 10分钟缓存

/**
 * 通过飞书API获取用户姓名
 */
export async function fetchUserNameFromFeishu(
  account: ResolvedFeishuAccount,
  openId: string
): Promise<string | null> {
  // 检查缓存
  const cached = userNameCache.get(openId);
  const now = Date.now();
  if (cached && cached.expireAt > now) {
    return cached.name;
  }

  if (!account.configured || !account.appId) {
    return null;
  }

  try {
    const client = createFeishuClient(account);

    // 调用飞书API获取用户信息
    const res: any = await client.contact.user.get({
      path: { user_id: openId },
      params: { user_id_type: "open_id" },
    });

    const name: string | undefined =
      res?.data?.user?.name ||
      res?.data?.user?.display_name ||
      res?.data?.user?.nickname ||
      res?.data?.user?.en_name;

    if (name && typeof name === "string") {
      // 缓存结果
      userNameCache.set(openId, { name, expireAt: now + USER_NAME_TTL_MS });
      return name;
    }

    return null;
  } catch (err) {
    console.error(`Failed to fetch user name for ${openId}:`, err);
    return null;
  }
}

/**
 * 获取用户显示名称（优先使用姓名， fallback 到 OpenID）
 */
export async function getUserDisplayName(
  identityMap: IdentityMap | null,
  openId: string,
  account?: ResolvedFeishuAccount
): Promise<string> {
  // 1. 先从身份映射表查
  if (identityMap) {
    const user = identityMap.verified_users[openId];
    if (user?.name) {
      return user.name;
    }
  }

  // 2. 尝试从飞书API获取
  if (account) {
    const apiName = await fetchUserNameFromFeishu(account, openId);
    if (apiName) {
      return apiName;
    }
  }

  // 3. fallback 到短格式的 OpenID
  return shortenOpenId(openId);
}

/**
 * 缩短 OpenID 显示
 * ou_0826a3ad594d71578976ee1f133f905b → ou_0826...905b
 */
export function shortenOpenId(openId: string): string {
  if (!openId || openId.length < 12) return openId;
  return `${openId.slice(0, 8)}...${openId.slice(-4)}`;
}

/**
 * 批量获取用户显示名称
 */
export async function getUserDisplayNames(
  identityMap: IdentityMap | null,
  openIds: string[],
  account?: ResolvedFeishuAccount
): Promise<Record<string, string>> {
  const result: Record<string, string> = {};

  for (const openId of openIds) {
    result[openId] = await getUserDisplayName(identityMap, openId, account);
  }

  return result;
}

/**
 * 用户权限等级
 */
export type PermissionLevel = "L1" | "L2" | "L3" | "L0";

/**
 * 已验证用户信息
 */
export interface VerifiedUser {
  name: string;
  level: PermissionLevel;
  department?: string;
  verified_at: string;
  status: "active" | "inactive";
  /** AI模型配置 - 如果未设置则使用全局默认模型 */
  model?: string;
  /** 用户专属系统提示词 */
  systemPrompt?: string;
}

/**
 * 身份映射表结构
 */
export interface IdentityMap {
  verified_users: Record<string, VerifiedUser>;
  pending_verifications: PendingVerification[];
  rejected_claims: RejectedClaim[];
}

export interface PendingVerification {
  request_id: string;
  author_id: string;
  claimed_name: string;
  channel: string;
  session_key: string;
  submitted_at: string;
  status: "waiting";
}

export interface RejectedClaim {
  author_id: string;
  claimed_name: string;
  reason: string;
  rejected_at: string;
}

/**
 * 加载身份映射表
 */
export function loadIdentityMap(identityPath: string): IdentityMap | null {
  try {
    if (!fs.existsSync(identityPath)) {
      return null;
    }
    const content = fs.readFileSync(identityPath, "utf-8");
    return yaml.load(content) as IdentityMap;
  } catch (error) {
    console.error("Failed to load identity map:", error);
    return null;
  }
}

/**
 * 获取用户权限等级
 */
export function getUserLevel(
  identityMap: IdentityMap | null,
  openId: string
): PermissionLevel {
  if (!identityMap) return "L0";
  const user = identityMap.verified_users[openId];
  if (!user || user.status !== "active") return "L0";
  return user.level;
}

/**
 * 获取用户信息
 */
export function getUserInfo(
  identityMap: IdentityMap | null,
  openId: string
): VerifiedUser | null {
  if (!identityMap) return null;
  return identityMap.verified_users[openId] ?? null;
}

/**
 * 获取用户配置的AI模型
 * @param identityMap 身份映射表
 * @param openId 用户OpenID
 * @param defaultModel 默认模型（如果用户未配置）
 * @returns 用户配置的模型或默认模型
 */
export function getUserModel(
  identityMap: IdentityMap | null,
  openId: string,
  defaultModel?: string
): string | undefined {
  if (!identityMap) return defaultModel;
  const user = identityMap.verified_users[openId];
  if (!user || user.status !== "active") return defaultModel;
  return user.model ?? defaultModel;
}

/**
 * 获取用户专属系统提示词
 * @param identityMap 身份映射表
 * @param openId 用户OpenID
 * @returns 用户专属提示词或undefined
 */
export function getUserSystemPrompt(
  identityMap: IdentityMap | null,
  openId: string
): string | undefined {
  if (!identityMap) return undefined;
  const user = identityMap.verified_users[openId];
  if (!user || user.status !== "active") return undefined;
  return user.systemPrompt;
}

/**
 * 检查是否为新用户（未登记）
 */
export function isNewUser(
  identityMap: IdentityMap | null,
  openId: string
): boolean {
  if (!identityMap) return true;
  return !identityMap.verified_users[openId];
}

/**
 * 提取身份声明
 * 匹配: "我是XXX", "我叫XXX", "我的名字是XXX"
 */
export function extractIdentityClaim(message: string): string | null {
  const patterns = [
    /^我是\s*(.+)$/i,
    /^我叫\s*(.+)$/i,
    /^我的名字是\s*(.+)$/i,
  ];
  
  for (const pattern of patterns) {
    const match = message.trim().match(pattern);
    if (match) {
      return match[1].trim();
    }
  }
  return null;
}

/**
 * 处理身份声明
 * 返回: 是否为新声明、是否自动确认、处理结果
 */
export function handleIdentityClaim(
  identityMap: IdentityMap,
  openId: string,
  claimedName: string
): {
  isNewClaim: boolean;
  autoConfirmed: boolean;
  existingUser?: VerifiedUser;
  message: string;
} {
  // 检查是否已登记此ID
  const existingUser = identityMap.verified_users[openId];
  if (existingUser) {
    return {
      isNewClaim: false,
      autoConfirmed: true,
      existingUser,
      message: `身份已确认，欢迎 ${existingUser.name}。`,
    };
  }

  // 检查是否有人已登记此名字
  const nameExists = Object.entries(identityMap.verified_users).find(
    ([_, user]) => user.name === claimedName && user.status === "active"
  );

  if (nameExists) {
    const [existingId, existing] = nameExists;
    
    // L1（大A）不允许自动确认
    if (existing.level === "L1") {
      return {
        isNewClaim: true,
        autoConfirmed: false,
        message: `身份声明「${claimedName}」已提交，等待大A确认...`,
      };
    }

    // 其他等级自动确认（ID变更）
    return {
      isNewClaim: true,
      autoConfirmed: true,
      existingUser: existing,
      message: `身份已自动确认，欢迎 ${claimedName}。检测到ID变更，已更新记录。`,
    };
  }

  // 全新人，需要人工确认
  return {
    isNewClaim: true,
    autoConfirmed: false,
    message: `您好！我是小A 🤖\n\n您的身份尚未登记，请等待大A确认后使用。\n\n如 urgent，请直接联系大A。`,
  };
}
