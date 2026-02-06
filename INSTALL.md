# OpenClaw Feishu 插件 - 安装指南

## 📦 安装方式

### 方式一：通过 OpenClaw CLI 安装（推荐）

```bash
# 从 GitHub 安装
openclaw plugins install https://github.com/Annmys/openclaw-feishu.git

# 或从 npm 安装（如果已发布）
openclaw plugins install @Annmys/openclaw-feishu
```

### 方式二：手动安装

```bash
# 1. 下载发布包
wget https://github.com/Annmys/openclaw-feishu/releases/download/v0.2.0/openclaw-feishu-v0.2.0.zip

# 2. 解压
unzip openclaw-feishu-v0.2.0.zip

# 3. 复制到插件目录
WORKSPACE=$(openclaw config get agents.defaults.workspace)
mkdir -p "$WORKSPACE/plugins"
cp -r openclaw-feishu "$WORKSPACE/plugins/"

# 4. 安装依赖
cd "$WORKSPACE/plugins/openclaw-feishu"
npm install --production
```

---

## ⚙️ 配置步骤

### 1. 配置飞书应用

```bash
openclaw config set channels.feishu.appId "cli_xxxxxxxxxxxx"
openclaw config set channels.feishu.appSecret "xxxxxxxxxxxxxxxx"
openclaw config set channels.feishu.enabled true
```

### 2. 配置中央权限（可选但推荐）

```bash
# 主控会话Key
openclaw config set channels.feishu.centralAuth.masterSessionKey "agent:main:main"

# 汇报群ID
openclaw config set channels.feishu.centralAuth.reportGroupId "oc_xxxxxxxxxxxxxxxx"

# 启用自动身份确认
openclaw config set channels.feishu.centralAuth.enableAutoConfirm true
```

### 3. 配置模型分配机制（可选）

**模型分配模式**：控制是否为不同用户分配不同的 AI 模型

```bash
# 模式一：统一模式（所有用户使用相同模型）
openclaw config set channels.feishu.centralAuth.modelAssignmentMode "unified"
openclaw config set channels.feishu.centralAuth.defaultModel "kimi-coding/k2p5"

# 模式二：分配模式（按用户配置分配不同模型）
openclaw config set channels.feishu.centralAuth.modelAssignmentMode "assigned"
openclaw config set channels.feishu.centralAuth.defaultModel "kimi-coding/k2p5"
```

**模式说明**：
- `unified` (统一模式)：所有用户使用相同的默认模型，忽略身份表中的 model 配置
- `assigned` (分配模式)：使用身份表中每个用户配置的专属模型（推荐）

**默认模型**：当用户使用分配模式但未配置专属模型时，使用此默认模型

### 3. 创建身份映射表

```bash
# 创建规则目录
mkdir -p ~/.openclaw/workspace/rules

# 创建身份映射表（参考下方的示例）
cat > ~/.openclaw/workspace/rules/feishu-identity.yaml << 'EOF'
---
# 飞书身份映射表
# 用于配置用户权限等级（L1/L2/L3/L0）

verified_users:
  # 大A - 最高权限（全局管理）
  ou_69ab2937fa9155c936862c9daf9182e7:
    name: "大A"
    level: "L1"
    department: "全局"
    verified_at: "2026-02-06T00:00:00+08:00"
    status: "active"
    
  # Bella - 部门负责人
  ou_yyyyyyyyyyyyyyyy:
    name: "Bella"
    level: "L2"
    department: "采购"
    verified_at: "2026-02-06T00:00:00+08:00"
    status: "active"
    
  # aa1 - 部门员工
  ou_zzzzzzzzzzzzzzzz:
    name: "aa1"
    level: "L3"
    department: "采购"
    verified_at: "2026-02-06T00:00:00+08:00"
    status: "active"

channels:
  feishu_groups:
    # 任务汇报群
    oc_xxxxxxxxxxxxxxxx:
      name: "任务汇报群"
      type: "group"
EOF
```

### 4. 重启 OpenClaw

```bash
openclaw gateway restart
```

---

## 🔍 验证安装

### 检查插件是否加载

```bash
openclaw plugins list
```

应该看到 `openclaw-feishu` 插件。

### 检查飞书通道

```bash
openclaw channels list
```

应该看到 `feishu` 通道。

### 测试消息接收

1. 在飞书私聊中发送消息给机器人
2. 检查 OpenClaw 日志是否有消息到达

---

## 🆘 常见问题

### Q1: 安装后插件未显示
**A:** 检查是否正确安装了依赖：
```bash
cd ~/.openclaw/workspace/plugins/openclaw-feishu
npm install --production
```

### Q2: 飞书消息无法接收
**A:** 检查飞书应用配置：
- 确认 `appId` 和 `appSecret` 正确
- 确认飞书应用已启用机器人能力
- 检查事件订阅 URL 是否正确配置

### Q3: 权限检查不生效
**A:** 检查身份映射表：
- 确认文件路径：`~/.openclaw/workspace/rules/feishu-identity.yaml`
- 确认 YAML 格式正确（可以使用在线 YAML 验证工具）
- 确认用户 ID 正确（飞书用户的 open_id）

### Q4: 如何获取飞书用户 ID
**A:** 在飞书私聊中发送任意消息，查看 OpenClaw 日志中的 `senderOpenId` 字段。

---

## 📚 权限等级说明

| 等级 | 名称 | 权限范围 |
|:----:|:----:|:---------|
| L1 | 管理员 | 全局管理、所有操作、规则修改 |
| L2 | 部门负责人 | 本部门规则修改、审批 L3 任务 |
| L3 | 部门员工 | 查询、提交任务、本部门文件读取 |
| L0 | 未授权 | 仅查询，任何操作需 L1 确认 |

---

## 🔗 相关链接

- 项目仓库：https://github.com/Annmys/openclaw-feishu
- 飞书开放平台：https://open.feishu.cn/
- OpenClaw 文档：https://docs.openclaw.ai/

---

*安装遇到问题？请在 GitHub Issues 中反馈。*
