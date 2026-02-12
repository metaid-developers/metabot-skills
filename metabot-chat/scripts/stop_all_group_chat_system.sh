#!/bin/bash
# 彻底关闭所有系统级别群聊监听的运行进程和运行脚本
# - 按 PID 文件关闭群聊监听，并 SIGKILL 未退出的进程
# - 按命令行匹配杀 group_chat_listener / group_chat_listener.ts 相关进程
# - 关闭所有场景回复/讨论进程
# - 再次按命令行扫一遍，确保无残留

set -e
cd "$(dirname "$0")/.."
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "🛑 彻底关闭所有系统级别群聊监听进程与脚本..."
echo ""

echo "1️⃣ 关闭群聊监听（PID 文件 + 进程匹配 + 必要时 SIGKILL）"
echo "----------------------------------------------"
"$SCRIPT_DIR/stop_group_chat_listener.sh"
echo ""

echo "2️⃣ 关闭场景回复/讨论进程（werewolf、metaweb_scenario、chat_poll 等）"
echo "----------------------------------------------"
"$SCRIPT_DIR/stop_scenario_reply.sh"
echo ""

echo "3️⃣ 系统级扫尾：按命令行匹配杀残留进程"
echo "----------------------------------------------"
FOUND=0
for pattern in 'group_chat_listener' 'discussion_on_latest'; do
  PIDS=$(pgrep -f "$pattern" 2>/dev/null || true)
  if [ -n "$PIDS" ]; then
    echo "$PIDS" | xargs kill -9 2>/dev/null || true
    echo "   已强制结束: $pattern (PIDs: $PIDS)"
    FOUND=1
  fi
done
[ $FOUND -eq 0 ] && echo "   无残留进程"
echo ""

# 清理 PID 文件（防止下次误判）
rm -f "$ROOT_DIR/.group_chat_listener.pid"
echo "✅ 已彻底关闭所有群聊监听相关进程与脚本"
echo "   PID 文件已清理: .group_chat_listener.pid"
