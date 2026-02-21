#!/bin/bash
# 统一聊天监听（群聊 + 私聊），使用 Socket 推送
# Cursor 内置终端运行需 network/all 权限，否则会 xhr poll error（见 .cursorrules / SKILL.md）
# 用法: ./run_unified_chat_listener.sh [Agent名称] [--no-open] [--auto-reply] [--private-only] [--mention-only]
# 示例: ./run_unified_chat_listener.sh "<agent_name>" --auto-reply  # 新消息时自动根据最新消息回复
#       ./run_unified_chat_listener.sh "<agent_name>" --auto-reply --private-only  # 仅回复私聊，不回复群聊
#       ./run_unified_chat_listener.sh "<agent_name>" --auto-reply --mention-only  # 仅回复 @提及本 Agent 的群聊消息
# 可选环境变量: AUTO_REPLY=1 开启自动回复，REPLY_PRIVATE_ONLY=1 仅私聊回复，REPLY_ONLY_MENTION=1 仅提及回复，REPLY_MAX_COUNT=20 最多回复次数
# 关闭: ./scripts/stop_unified_chat_listener.sh
# 查看日志: ./scripts/tail_chat_history.sh

cd "$(dirname "$0")/.."
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CHAT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
LISTENER_PID_FILE="$CHAT_DIR/.unified_chat_listener.pid"
LOG_FILE="unified_chat_listener.log"

AGENT_NAME=""
AUTO_REPLY_ENV=""
PRIVATE_ONLY_ENV=""
MENTION_ONLY_ENV=""
for arg in "$@"; do
  case "$arg" in
    --no-open)      ;;
    --auto-reply)   AUTO_REPLY_ENV="AUTO_REPLY=1"; ;;
    --private-only) PRIVATE_ONLY_ENV="REPLY_PRIVATE_ONLY=1"; ;;
    --mention-only) MENTION_ONLY_ENV="REPLY_ONLY_MENTION=1"; ;;
    *)              [ -z "$AGENT_NAME" ] && AGENT_NAME="$arg"; ;;
  esac
done

LOG_PATH="$CHAT_DIR/$LOG_FILE"
echo "🔄 启动统一聊天监听（群聊 + 私聊）"
[ -n "$AGENT_NAME" ] && echo "   Agent: $AGENT_NAME"
[ -n "$AUTO_REPLY_ENV" ] && echo "   自动回复: 已开启（私聊/群聊新消息将根据最新消息回复）"
[ -n "$PRIVATE_ONLY_ENV" ] && echo "   仅私聊回复: 已开启（不回复群聊，只回复私聊最新消息）"
[ -n "$MENTION_ONLY_ENV" ] && echo "   仅提及回复: 已开启（群聊仅回复 @本Agent 的消息）"
echo "   监听日志（含 Socket 连接状态）: $LOG_PATH"
echo ""

nohup env AGENT_NAME="$AGENT_NAME" $AUTO_REPLY_ENV $PRIVATE_ONLY_ENV $MENTION_ONLY_ENV npx ts-node scripts/unified_chat_listener.ts "$AGENT_NAME" >> "$LOG_PATH" 2>&1 &
PID=$!
echo "$PID" > "$LISTENER_PID_FILE"
echo "✅ 监听已启动 (PID: $PID)"
echo ""
echo "   【查看监听日志】确认 Socket 是否连接成功、是否收到推送："
echo "   tail -f \"$LOG_PATH\""
echo ""
echo "   【关闭监听】执行: ./scripts/stop_unified_chat_listener.sh"
echo "   【查看聊天消息】执行: ./scripts/tail_chat_history.sh"
echo ""
