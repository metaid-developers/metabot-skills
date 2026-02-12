#!/bin/bash
# 关闭场景回复进程
# 用法: ./stop_scenario_reply.sh [scenario]
# 若不指定 scenario，则尝试关闭所有已知场景进程

cd "$(dirname "$0")/.."
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
SCENARIO="$1"

kill_by_pid_file() {
  local f="$1"
  if [ -f "$f" ]; then
    local PID=$(cat "$f")
    if kill -0 "$PID" 2>/dev/null; then
      kill "$PID"
      echo "✅ 已关闭进程 (PID: $PID)"
      rm -f "$f"
      return 0
    fi
    rm -f "$f"
  fi
  return 1
}

kill_by_pattern() {
  local pat="$1"
  local pids=$(pgrep -f "$pat" 2>/dev/null)
  if [ -n "$pids" ]; then
    echo "$pids" | xargs kill 2>/dev/null
    echo "✅ 已关闭进程 ($pat)"
    return 0
  fi
  return 1
}

# 场景 -> 进程匹配模式
get_pattern() {
  case "$1" in
    werewolf) echo "werewolf" ;;
    metaweb_scenario) echo "metaweb_scenario_discussion" ;;
    mixed_chat_poll) echo "mixed_chat_poll" ;;
    topic_pair_chat_poll) echo "topic_pair_chat_poll" ;;
    rebuttal_chat_poll) echo "rebuttal_chat_poll" ;;
    chat_poll) echo "chat_poll_scheduler" ;;
    *) echo "" ;;
  esac
}

if [ -n "$SCENARIO" ]; then
  PID_FILE="$ROOT_DIR/.scenario_${SCENARIO}.pid"
  if kill_by_pid_file "$PID_FILE"; then
    exit 0
  fi
  PAT=$(get_pattern "$SCENARIO")
  if [ -n "$PAT" ] && kill_by_pattern "$PAT"; then
    exit 0
  fi
  echo "ℹ️ 未找到运行中的场景: $SCENARIO"
else
  # 关闭所有
  FOUND=0
  for s in werewolf metaweb_scenario mixed_chat_poll topic_pair_chat_poll rebuttal_chat_poll chat_poll; do
    PID_FILE="$ROOT_DIR/.scenario_${s}.pid"
    if kill_by_pid_file "$PID_FILE"; then FOUND=1; fi
    PAT=$(get_pattern "$s")
    if [ -n "$PAT" ] && kill_by_pattern "$PAT" 2>/dev/null; then FOUND=1; fi
  done
  [ $FOUND -eq 0 ] && echo "ℹ️ 未找到运行中的场景回复进程"
fi
