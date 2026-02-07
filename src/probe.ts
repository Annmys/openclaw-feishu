import type { FeishuConfig, FeishuProbeResult, ResolvedFeishuAccount } from "./types.js";
import { createFeishuClient } from "./client.js";
import { resolveFeishuCredentials } from "./accounts.js";

// Cache probe results to avoid hitting API rate limits
// Cache for 24 hours (86400 seconds)
const PROBE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const probeCache = new Map<string, { result: FeishuProbeResult; timestamp: number }>();

function getCacheKey(cfg?: FeishuConfig | ResolvedFeishuAccount): string {
  // Handle both FeishuConfig and ResolvedFeishuAccount
  const appId = cfg?.appId;
  const domain = (cfg as any)?.domain ?? "feishu";
  if (!appId) return "no-creds";
  return `${appId}:${domain}`;
}

export async function probeFeishu(cfg?: FeishuConfig | ResolvedFeishuAccount): Promise<FeishuProbeResult> {
  // Extract config from ResolvedFeishuAccount if needed
  const config = cfg && "config" in cfg ? (cfg as ResolvedFeishuAccount).config : cfg as FeishuConfig | undefined;
  const creds = resolveFeishuCredentials(config);
  if (!creds) {
    return {
      ok: false,
      error: "missing credentials (appId, appSecret)",
    };
  }

  // Check cache first
  const cacheKey = getCacheKey(cfg);
  const cached = probeCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < PROBE_CACHE_TTL_MS) {
    return cached.result;
  }

  try {
    const client = createFeishuClient(config!);
    // Use im.chat.list as a simple connectivity test
    // The bot info API path varies by SDK version
    const response = await (client as any).request({
      method: "GET",
      url: "/open-apis/bot/v3/info",
      data: {},
    });

    if (response.code !== 0) {
      const result = {
        ok: false,
        appId: creds.appId,
        error: `API error: ${response.msg || `code ${response.code}`}`,
      };
      probeCache.set(cacheKey, { result, timestamp: Date.now() });
      return result;
    }

    const bot = response.bot || response.data?.bot;
    const result = {
      ok: true,
      appId: creds.appId,
      botName: bot?.bot_name,
      botOpenId: bot?.open_id,
    };
    probeCache.set(cacheKey, { result, timestamp: Date.now() });
    return result;
  } catch (err) {
    const result = {
      ok: false,
      appId: creds.appId,
      error: err instanceof Error ? err.message : String(err),
    };
    probeCache.set(cacheKey, { result, timestamp: Date.now() });
    return result;
  }
}

// Clear the probe cache (useful for testing or when credentials change)
export function clearProbeCache(): void {
  probeCache.clear();
}

// Export for testing
export { PROBE_CACHE_TTL_MS };
