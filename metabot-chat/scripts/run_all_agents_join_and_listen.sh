#!/bin/bash
# 让所有 Agent 参与到群聊中：先批量加群，再开启群聊监听
# 用法: ./run_all_agents_join_and_listen.sh [group_id] [--discussion]
#       不传 group_id 时使用 config.json 中的 groupId
#       --discussion：对最新消息进行话题讨论（多 Agent 轮流发言，优先被 @ 的开场）

set -e
cd "$(dirname "$0")/.."
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CHAT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

USE_DISCUSSION=false
for a in "$@"; do
  if [ "$a" = "--discussion" ]; then USE_DISCUSSION=true; break; fi
done
GROUP_ID="${1:-}"
[ "$GROUP_ID" = "--discussion" ] && GROUP_ID=""
if [ -z "$GROUP_ID" ] && [ -f "$ROOT_DIR/config.json" ]; then
  if command -v jq >/dev/null 2>&1; then
    GROUP_ID=$(jq -r '.groupInfoList[0].groupId // .groupId // ""' "$ROOT_DIR/config.json")
  fi
fi
if [ -z "$GROUP_ID" ]; then
  GROUP_ID="c1d5c0c7c4430283b3155b25d59d98ba95b941d9bfc3542bf89ba56952058f85i0"
fi

echo "=============================================="
echo "🎯 让所有 Agent 参与到群聊中"
echo "=============================================="
echo "   群组: $GROUP_ID"
echo ""

echo "📌 第一步：批量加群（account.json 中所有 Agent 加入该群）"
echo "----------------------------------------------"
cd "$CHAT_DIR"
npx ts-node scripts/batch_join_group.ts "$GROUP_ID"
echo ""

if [ "$USE_DISCUSSION" = true ]; then
  echo "📌 第二步：启动群聊监听（对最新消息话题讨论，优先被 @ 的开场）"
else
  echo "📌 第二步：启动群聊监听（所有 Agent 参与回复：被 @ 优先，否则随机）"
fi
echo "----------------------------------------------"
if [ "$USE_DISCUSSION" = true ]; then
  "$SCRIPT_DIR/run_group_chat_listener.sh" "$GROUP_ID" --all-agents --discussion
else
  "$SCRIPT_DIR/run_group_chat_listener.sh" "$GROUP_ID" --all-agents
fi
echo ""
echo "✅ 所有 Agent 已参与群聊：已加群并开启监听"
