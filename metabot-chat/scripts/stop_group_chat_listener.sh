#!/bin/bash
# 彻底关闭群聊监听进程（PID 文件 + 按命令行匹配杀进程，必要时 SIGKILL）

cd "$(dirname "$0")/.."
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
LISTENER_PID_FILE="$ROOT_DIR/.group_chat_listener.pid"

KILLED=0

# 1) 按 PID 文件杀主进程
if [ -f "$LISTENER_PID_FILE" ]; then
  PID=$(cat "$LISTENER_PID_FILE")
  if kill -0 "$PID" 2>/dev/null; then
    kill "$PID" 2>/dev/null
    sleep 1
    if kill -0 "$PID" 2>/dev/null; then
      kill -9 "$PID" 2>/dev/null
    fi
    echo "✅ 已关闭群聊监听进程 (PID: $PID)"
    KILLED=1
  else
    echo "⚠️ PID 文件中的进程 $PID 已不存在"
  fi
  rm -f "$LISTENER_PID_FILE"
fi

# 2) 按命令行匹配：group_chat_listener（含 .ts 与 nohup 子进程）
for pattern in 'group_chat_listener' 'group_chat_listener.ts'; do
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

[ $KILLED -eq 0 ] && echo "ℹ️ 未找到运行中的群聊监听进程"
