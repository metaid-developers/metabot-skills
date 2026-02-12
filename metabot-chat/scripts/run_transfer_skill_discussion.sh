#!/bin/bash
# 开启群聊监听，并启动 Create-Transfer-Skill 方案讨论
# 随机 2 反驳型 + 2 技术向 Agent，30 分钟讨论，上下半场，随机主持人开场与总结

cd "$(dirname "$0")/.."
CHAT_DIR="$(pwd)"
GROUP_ID="c1d5c0c7c4430283b3155b25d59d98ba95b941d9bfc3542bf89ba56952058f85i0"

echo "📋 Create-Transfer-Skill 方案讨论"
echo "   群组: $GROUP_ID"
echo "   内容: 如何开发 Skill（Create-Transfer-Skill-Project）"
echo "   时长: 30 分钟（上下半场各约 15 分钟）"
echo ""

# 1) 开启群聊监听（当前终端后台，仅拉取消息不指定回复者，避免与讨论脚本抢发言）
echo "1️⃣ 启动群聊监听（后台）..."
export GROUP_ID
"$CHAT_DIR/scripts/run_group_chat_listener.sh" "$GROUP_ID" "" "group_chat_listener.log" --no-open
sleep 3
echo ""

# 2) 运行 30 分钟讨论（2 反驳型 + 2 技术向，随机主持人开场与总结）
echo "2️⃣ 启动方案讨论（30 分钟）..."
npx ts-node scripts/transfer_skill_discussion.ts

echo ""
echo "✅ 讨论流程已结束。关闭群聊监听可执行: ./scripts/stop_group_chat_listener.sh"
