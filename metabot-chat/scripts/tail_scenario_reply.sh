#!/bin/bash
# 打印场景回复日志
# 用法: ./tail_scenario_reply.sh [scenario]
# 不指定 scenario 时列出可用场景及对应日志文件

cd "$(dirname "$0")/.."
SCENARIO="$1"

case "$SCENARIO" in
  werewolf) LOG="werewolf.log" ;;
  metaweb_scenario) LOG="metaweb_scenario_discussion.log" ;;
  mixed_chat_poll) LOG="mixed_chat_poll.log" ;;
  topic_pair_chat_poll) LOG="topic_pair_chat_poll.log" ;;
  rebuttal_chat_poll) LOG="rebuttal_chat_poll.log" ;;
  chat_poll) LOG="chat_poll.log" ;;
  "")
    echo "用法: ./tail_scenario_reply.sh <scenario>"
    echo "场景: werewolf | metaweb_scenario | mixed_chat_poll | topic_pair_chat_poll | rebuttal_chat_poll | chat_poll"
    exit 0
    ;;
  *)
    LOG="${SCENARIO}.log"
    ;;
esac

if [ -f "$LOG" ]; then
  tail -f "$LOG"
else
  echo "ℹ️ 日志文件不存在: $LOG"
  echo "   请先启动场景: ./scripts/run_scenario_reply.sh $SCENARIO"
fi
