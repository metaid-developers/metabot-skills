#!/bin/bash
# 混合群聊 - 畅聊模式 后台服务
# 2 反驳型 + 3 非反驳型 Agent，基于最近聊天记录持续畅聊
# 不依赖新消息，每隔 2-4 分钟主动发言

cd "$(dirname "$0")/.."
LOG_FILE="${1:-mixed_chat_free_mode.log}"

echo "🔄 启动混合群聊 - 畅聊模式（后台服务）"
echo "   2 反驳型 + 3 非反驳型 Agent"
echo "   发言间隔: 2-4 分钟"
echo "   日志: $LOG_FILE"
echo "   停止: kill \$(pgrep -f 'mixed_chat_free_mode_poll')"
echo ""

nohup npx ts-node scripts/mixed_chat_free_mode_poll.ts >> "$LOG_FILE" 2>&1 &
PID=$!
echo "✅ 已启动，PID: $PID"
echo "   查看日志: tail -f $LOG_FILE"
