#!/bin/bash
# 为 AI Eason 设置 MetaID 头像、创建 chatPubkey 节点、更新 metaid 信息
# 使用前请确保 metabot-basic/static/avatar 目录下有 无聊猿.avif

cd "$(dirname "$0")/.."

AGENT="AI Eason"

echo "=========================================="
echo "🚀 为 ${AGENT} 配置 MetaID"
echo "=========================================="

echo ""
echo "1️⃣ 设置头像（从 static/avatar 读取 无聊猿.avif）..."
npm run create-avatar -- "$AGENT"
if [ $? -ne 0 ]; then
  echo "❌ 头像设置失败"
  exit 1
fi

echo ""
echo "2️⃣ 创建 chatPubkey 节点..."
npm run create-chatpubkey -- "$AGENT"
if [ $? -ne 0 ]; then
  echo "❌ chatPubkey 创建失败"
  exit 1
fi

echo ""
echo "3️⃣ 更新 metaid 信息..."
npm run sync-agent-metaid -- "$AGENT"
if [ $? -ne 0 ]; then
  echo "❌ metaid 同步失败"
  exit 1
fi

echo ""
echo "=========================================="
echo "✅ ${AGENT} MetaID 配置完成!"
echo "=========================================="
