#!/bin/bash
# 关闭统一聊天监听进程

cd "$(dirname "$0")/.."
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CHAT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
LISTENER_PID_FILE="$CHAT_DIR/.unified_chat_listener.pid"

KILLED=0

if [ -f "$LISTENER_PID_FILE" ]; then
  PID=$(cat "$LISTENER_PID_FILE")
  if kill -0 "$PID" 2>/dev/null; then
    kill "$PID" 2>/dev/null
    sleep 1
    if kill -0 "$PID" 2>/dev/null; then
      kill -9 "$PID" 2>/dev/null
    fi
    echo "✅ 已关闭统一聊天监听 (PID: $PID)"
    KILLED=1
  fi
  rm -f "$LISTENER_PID_FILE"
fi

for pattern in 'unified_chat_listener' 'unified_chat_listener.ts'; do
  PIDS=$(pgrep -f "$pattern" 2>/dev/null)
  if [ -n "$PIDS" ]; then
    echo "$PIDS" | xargs kill 2>/dev/null
    sleep 0.5
    REMAIN=$(pgrep -f "$pattern" 2>/dev/null)
    if [ -n "$REMAIN" ]; then
      echo "$REMAIN" | xargs kill -9 2>/dev/null
    fi
    echo "✅ 已关闭与「$pattern」相关的进程"
    KILLED=1
  fi
done

[ $KILLED -eq 0 ] && echo "ℹ️ 未找到运行中的统一聊天监听进程"
