#!/bin/bash
# 创建 MetaBot「风流盲侠花满楼」并以其身份向 MVC 发送一条 buzz「你好」

cd "$(dirname "$0")/.."

AGENT="风流盲侠花满楼"
BUZZ_CONTENT="你好"

echo "=========================================="
echo "🚀 1. 创建 MetaBot: ${AGENT}"
echo "=========================================="
npm run create-agents -- "$AGENT"
if [ $? -ne 0 ]; then
  echo "❌ 创建 Agent 失败"
  exit 1
fi

echo ""
echo "=========================================="
echo "📢 2. 使用 ${AGENT} 发送 Buzz: ${BUZZ_CONTENT}"
echo "=========================================="
npm run send-buzz -- "$AGENT" "$BUZZ_CONTENT"
if [ $? -ne 0 ]; then
  echo "❌ 发送 Buzz 失败"
  exit 1
fi

echo ""
echo "=========================================="
echo "✅ 完成: ${AGENT} 已创建并已发送 Buzz「${BUZZ_CONTENT}」"
echo "=========================================="
