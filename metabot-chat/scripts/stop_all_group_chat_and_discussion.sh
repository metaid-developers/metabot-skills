#!/bin/bash
# 关闭当前所有群聊监听进程与讨论相关进程
# - 群聊监听（含话题讨论模式）
# - 场景回复/讨论（werewolf、metaweb_scenario、chat_poll 等）

cd "$(dirname "$0")/.."
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "🛑 关闭所有群聊监听与讨论相关进程..."
echo ""

echo "1️⃣ 关闭群聊监听进程"
echo "----------------------------------------------"
"$SCRIPT_DIR/stop_group_chat_listener.sh"
echo ""

echo "2️⃣ 关闭场景回复/讨论进程（werewolf、metaweb_scenario、chat_poll 等）"
echo "----------------------------------------------"
"$SCRIPT_DIR/stop_scenario_reply.sh"
echo ""

echo "✅ 已执行：群聊监听与讨论进程已关闭"
