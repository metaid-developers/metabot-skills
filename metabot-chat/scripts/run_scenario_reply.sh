#!/bin/bash
# 场景回复后台启动脚本
# 当用户开启群聊监听后，在对话框要求对监听群聊内容进行具体 XX 场景的回复时，由 skills 自动调用
# 在后台启动对应场景进程，并输出关闭、查看日志的命令
#
# 用法: ./run_scenario_reply.sh <scenario> [log_file]
# 场景: werewolf | metaweb_scenario | mixed_chat_poll | topic_pair_chat_poll | rebuttal_chat_poll | chat_poll

cd "$(dirname "$0")/.."
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
SCENARIO="${1:-chat_poll}"
LOG_FILE="${2:-${SCENARIO}.log}"
PID_FILE="$ROOT_DIR/.scenario_${SCENARIO}.pid"

# 场景 -> 脚本映射
case "$SCENARIO" in
  werewolf)
    CMD="npx ts-node scripts/werewolf.ts"
    ;;
  metaweb_scenario)
    CMD="npx ts-node scripts/metaweb_scenario_discussion.ts"
    ;;
  mixed_chat_poll)
    CMD="npx ts-node scripts/mixed_chat_poll.ts"
    ;;
  topic_pair_chat_poll)
    if [ -f "scripts/topic_pair_chat_poll.ts" ]; then
      CMD="npx ts-node scripts/topic_pair_chat_poll.ts"
    elif [ -f "../projects/metabot-chat/scripts/topic_pair_chat_poll.ts" ]; then
      CMD="npx ts-node ../projects/metabot-chat/scripts/topic_pair_chat_poll.ts"
    else
      CMD="npx ts-node scripts/chat_poll_scheduler.ts"
      echo "⚠️ topic_pair_chat_poll 脚本未找到，回退到 chat_poll_scheduler"
    fi
    ;;
  rebuttal_chat_poll)
    CMD="npx ts-node scripts/rebuttal_chat_poll.ts"
    ;;
  chat_poll|*)
    CMD="npx ts-node scripts/chat_poll_scheduler.ts"
    SCENARIO="chat_poll"
    LOG_FILE="${2:-chat_poll.log}"
    PID_FILE="$ROOT_DIR/.scenario_chat_poll.pid"
    ;;
esac

echo "🔄 启动场景回复: $SCENARIO（后台模式）"
echo "   日志: $LOG_FILE"
echo ""

nohup bash -c "$CMD" >> "$LOG_FILE" 2>&1 &
PID=$!
echo "$PID" > "$PID_FILE"

echo "✅ 场景回复进程已开启 ($SCENARIO)"
echo ""
echo "   【关闭场景回复】执行以下命令停止："
echo "   ./scripts/stop_scenario_reply.sh $SCENARIO"
echo "   或: kill \$(cat $PID_FILE)"
echo ""
echo "   【查看场景日志】在终端执行："
echo "   ./scripts/tail_scenario_reply.sh $SCENARIO"
echo "   或: tail -f $LOG_FILE"
echo ""
