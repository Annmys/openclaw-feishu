import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { feishuPlugin } from "./src/channel.js";
import { setFeishuRuntime } from "./src/runtime.js";
import { registerFeishuDocTools } from "./src/docx.js";
import { registerFeishuWikiTools } from "./src/wiki.js";
import { registerFeishuDriveTools } from "./src/drive.js";
import { registerFeishuPermTools } from "./src/perm.js";
import { registerFeishuBitableTools } from "./src/bitable.js";

export { monitorFeishuProvider } from "./src/monitor.js";
export {
  sendMessageFeishu,
  sendCardFeishu,
  updateCardFeishu,
  editMessageFeishu,
  getMessageFeishu,
} from "./src/send.js";
export {
  uploadImageFeishu,
  uploadFileFeishu,
  sendImageFeishu,
  sendFileFeishu,
  sendMediaFeishu,
} from "./src/media.js";
export { probeFeishu } from "./src/probe.js";
export {
  addReactionFeishu,
  removeReactionFeishu,
  listReactionsFeishu,
  FeishuEmoji,
} from "./src/reactions.js";
export {
  extractMentionTargets,
  extractMessageBody,
  isMentionForwardRequest,
  formatMentionForText,
  formatMentionForCard,
  formatMentionAllForText,
  formatMentionAllForCard,
  buildMentionedMessage,
  buildMentionedCardContent,
  type MentionTarget,
} from "./src/mention.js";
export { feishuPlugin } from "./src/channel.js";

// 中央权限模块导出 ⭐
export {
  createCentralAuth,
  CentralAuthManager,
  type CentralAuthConfig,
} from "./src/central-auth.js";
export {
  loadIdentityMap,
  getUserLevel,
  getUserInfo,
  isNewUser,
  extractIdentityClaim,
  handleIdentityClaim,
  fetchUserNameFromFeishu,
  getUserDisplayName,
  getUserDisplayNames,
  shortenOpenId,
  type IdentityMap,
  type VerifiedUser,
  type PermissionLevel,
} from "./src/identity.js";
export {
  checkPermission,
  isSensitiveOperation,
  getPermissionDeniedMessage,
  detectOperationType,
  PERMISSION_MATRIX,
  type OperationType,
} from "./src/gatekeeper.js";
export {
  formatTaskReport,
  formatMasterNotification,
  shouldReportToGroup,
  buildForwardToMasterMessage,
  type TaskReport,
} from "./src/reporter.js";

const plugin = {
  id: "openclaw-feishu",
  name: "Feishu",
  description: "OpenClaw Feishu/Lark channel plugin with central auth",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    setFeishuRuntime(api.runtime);
    api.registerChannel({ plugin: feishuPlugin });
    registerFeishuDocTools(api);
    registerFeishuWikiTools(api);
    registerFeishuDriveTools(api);
    registerFeishuPermTools(api);
    registerFeishuBitableTools(api);
  },
};

export default plugin;
