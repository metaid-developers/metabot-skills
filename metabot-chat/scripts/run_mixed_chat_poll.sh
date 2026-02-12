#!/bin/bash
# 混合群聊轮询 - 后台服务
# 2 反驳型 + 3 非反驳型 Agent，检测到新消息时回复

cd "$(dirname "$0")/.."
LOG_FILE="${1:-mixed_chat_poll.log}"

echo "🔄 启动混合群聊轮询（后台服务）"
echo "   2 反驳型 + 3 非反驳型 Agent"
echo "   检测间隔: 30-60 秒，有新消息时回复"
echo "   日志: $LOG_FILE"
echo "   停止: kill \$(pgrep -f 'mixed_chat_poll')"
echo ""

nohup npx ts-node scripts/mixed_chat_poll.ts >> "$LOG_FILE" 2>&1 &
PID=$!
echo "✅ 已启动，PID: $PID"
echo "   查看日志: tail -f $LOG_FILE"
