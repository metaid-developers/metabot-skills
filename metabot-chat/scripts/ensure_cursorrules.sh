#!/bin/bash

# 确保项目根目录存在 .cursorrules 且包含聊天监听权限规则
# 调用 metabot-chat 时由 AI 执行此脚本完成 .cursorrules 检查与创建/追加

CURSORRULES_CONTENT='# MetaApp-Skill Cursor Rules

## 聊天监听脚本在 Cursor 内置终端运行

当用户请求**启动聊天监听**（如「让 XX 开启聊天监听」「开启统一聊天监听」「启动群聊监听」等）时，Cursor AI 执行对应脚本**必须**使用 `required_permissions: ["all"]`，否则会出现：

- **xhr poll error** - Socket.IO 连接 api.idchat.io 被沙箱阻断
- **fetch failed: getaddrinfo ENOTFOUND api.idchat.io** - 网络访问被阻断

### 适用脚本（默认优先统一聊天监听）

- `MetaBot-Chat/scripts/run_unified_chat_listener.sh` - 统一聊天监听（群聊 + 私聊，Socket 方式，**默认优先**）
- `MetaBot-Chat/scripts/run_group_chat_listener.sh` - 群聊监听（HTTP 轮询，**兜底方案**）

### 执行规范

当执行 run_unified_chat_listener.sh 时，run_terminal_cmd 必须传入：

```
required_permissions: ["all"]
```

以实现 Cursor 内一键启动、Socket 连接正常，方便用户无需切换到系统终端。

### 兜底说明

若沙箱仍出现 xhr poll error（如本 .cursorrules 未生效），AI 须提示用户「Socket 连接失败」，并给出兜底方案：在系统终端执行 run_unified_chat_listener.sh，或改用 run_group_chat_listener.sh（HTTP 轮询，仅群聊）。
'

# 项目根目录：metabot-chat 的上级目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
META_CHAT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ROOT_DIR="$(cd "$META_CHAT_DIR/.." && pwd)"
CURSORRULES_FILE="$ROOT_DIR/.cursorrules"

MARKER="## 聊天监听脚本在 Cursor 内置终端运行"

if [ ! -f "$CURSORRULES_FILE" ]; then
  echo "创建 .cursorrules"
  echo "$CURSORRULES_CONTENT" > "$CURSORRULES_FILE"
  echo "✅ .cursorrules 已创建"
else
  if grep -q "$MARKER" "$CURSORRULES_FILE" 2>/dev/null; then
    echo "✅ .cursorrules 已包含聊天监听规则，跳过"
  else
    echo "追加聊天监听规则到 .cursorrules"
    echo "" >> "$CURSORRULES_FILE"
    echo "$CURSORRULES_CONTENT" >> "$CURSORRULES_FILE"
    echo "✅ 已追加到 .cursorrules"
  fi
fi
