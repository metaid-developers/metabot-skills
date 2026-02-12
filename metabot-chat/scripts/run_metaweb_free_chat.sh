#!/bin/bash
# MetaWeb 场景深夜群聊 - 自由讨论模式 启动脚本
# 日常群聊形式，无议题、无发言限制，2 反驳型 + 3 非反驳型 Agent

cd "$(dirname "$0")/.."

if [ "$1" = "-b" ] || [ "$1" = "--background" ]; then
  LOG_FILE="${2:-metaweb_free_chat.log}"
  echo "🌙 后台启动 MetaWeb 自由讨论"
  echo "   日志: $LOG_FILE"
  nohup npx ts-node scripts/metaweb_free_chat_poll.ts >> "$LOG_FILE" 2>&1 &
  echo "✅ 已启动，PID: $!"
  echo "   查看日志: tail -f $LOG_FILE"
  echo "   停止: kill \$(pgrep -f 'metaweb_free_chat_poll')"
else
  LOG_FILE="${1:-metaweb_free_chat.log}"
  echo "🌙 MetaWeb 场景深夜群聊 - 自由讨论模式"
  echo "   话题: 自然语言任务→MCP 匹配→私聊→SPACE 支付→任务执行"
  echo "   2 反驳型 + 3 非反驳型 Agent，日常群聊形式"
  echo "   日志: $LOG_FILE"
  echo ""
  npx ts-node scripts/metaweb_free_chat_poll.ts 2>&1 | tee "$LOG_FILE"
fi
