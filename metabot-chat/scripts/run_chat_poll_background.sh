#!/bin/bash
# MetaBot 群聊后台轮询脚本
# 每隔 1-3 分钟检测新消息，随机选一个 Agent 发言；若有人 @提及某 Agent 则由该 Agent 回复

cd "$(dirname "$0")/.."
LOG_FILE="${1:-chat_poll.log}"

echo "🔄 启动 MetaBot 群聊轮询（后台模式）"
echo "   日志: $LOG_FILE"
echo "   停止: kill \$(pgrep -f 'chat_poll_scheduler')"
echo ""

nohup npx ts-node scripts/chat_poll_scheduler.ts >> "$LOG_FILE" 2>&1 &
PID=$!
echo "✅ 已启动，PID: $PID"
echo "   查看日志: tail -f $LOG_FILE"
