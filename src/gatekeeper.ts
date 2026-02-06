import type { PermissionLevel } from "./identity.js";

/**
 * 操作类型
 */
export type OperationType =
  | "query"           // 查询/搜索
  | "read_file"       // 读取文件
  | "write_file"      // 修改文件
  | "git"             // Git操作
  | "docker"          // Docker操作
  | "system"          // 系统命令
  | "send_message"    // 发送消息/邮件
  | "modify_rules";   // 修改规则文件

/**
 * 权限矩阵
 * 定义每种操作在不同权限等级下的允许情况
 */
export const PERMISSION_MATRIX: Record<OperationType, Record<PermissionLevel, boolean>> = {
  query: {
    L1: true,
    L2: true,
    L3: true,
    L0: true,
  },
  read_file: {
    L1: true,
    L2: true,
    L3: false, // L3只能读取本部门文件，需要单独判断
    L0: false,
  },
  write_file: {
    L1: true,
    L2: false, // L2只能修改本部门规则，需要单独判断
    L3: false,
    L0: false,
  },
  git: {
    L1: true,
    L2: false,
    L3: false,
    L0: false,
  },
  docker: {
    L1: true,
    L2: false,
    L3: false,
    L0: false,
  },
  system: {
    L1: true,
    L2: false,
    L3: false,
    L0: false,
  },
  send_message: {
    L1: true,
    L2: false, // L2需要L1确认
    L3: false,
    L0: false,
  },
  modify_rules: {
    L1: true,
    L2: false, // L2只能修改本部门RULE.md
    L3: false,
    L0: false,
  },
};

/**
 * 检查操作权限
 */
export function checkPermission(
  level: PermissionLevel,
  operation: OperationType,
  isDepartmentResource: boolean = false,
  isOwnDepartment: boolean = false
): boolean {
  const baseAllowed = PERMISSION_MATRIX[operation][level];
  
  // L3 读取本部门资源
  if (level === "L3" && operation === "read_file" && isOwnDepartment) {
    return true;
  }
  
  // L2 修改本部门规则
  if (level === "L2" && operation === "modify_rules" && isOwnDepartment) {
    return true;
  }
  
  // L2 修改本部门文件
  if (level === "L2" && operation === "write_file" && isOwnDepartment) {
    return true;
  }
  
  return baseAllowed;
}

/**
 * 判断是否为敏感操作（需要转主控）
 */
export function isSensitiveOperation(operation: OperationType): boolean {
  return ["git", "docker", "system", "modify_rules", "send_message"].includes(operation);
}

/**
 * 获取权限不足时的提示消息
 */
export function getPermissionDeniedMessage(
  level: PermissionLevel,
  operation: OperationType
): string {
  if (level === "L0") {
    return "请先私聊大A进行身份登记，完成登记后才能使用。";
  }
  
  if (operation === "modify_rules" && level === "L2") {
    return "此操作涉及其他部门规则，已提交到大A确认，请稍候...";
  }
  
  if (["git", "docker", "system"].includes(operation)) {
    return "此操作需要最高权限，已为您提交到大A确认，请稍候...";
  }
  
  return "此操作超出您的权限范围，已为您提交到大A确认，请稍候...";
}

/**
 * 解析用户请求，判断操作类型
 * 简单启发式判断，实际使用时可能需要更复杂的NLP
 */
export function detectOperationType(message: string): OperationType {
  const lowerMsg = message.toLowerCase();
  
  // Git操作
  if (/\b(git|push|pull|commit|clone|checkout)\b/.test(lowerMsg)) {
    return "git";
  }
  
  // Docker操作
  if (/\b(docker|container|image|compose)\b/.test(lowerMsg)) {
    return "docker";
  }
  
  // 系统命令
  if (/\b(rm|mv|cp|chmod|chown|sudo|apt|yum|systemctl)\b/.test(lowerMsg)) {
    return "system";
  }
  
  // 修改规则
  if (/\b(rule|规则|修改.*配置)\b/.test(lowerMsg)) {
    return "modify_rules";
  }
  
  // 发送消息
  if (/\b(发送|邮件|email|群发|通知)\b/.test(lowerMsg)) {
    return "send_message";
  }
  
  // 写文件
  if (/\b(修改|写入|创建|删除).*文件\b/.test(lowerMsg)) {
    return "write_file";
  }
  
  // 读文件
  if (/\b(读取|查看|打开).*文件\b/.test(lowerMsg)) {
    return "read_file";
  }
  
  // 默认查询
  return "query";
}
