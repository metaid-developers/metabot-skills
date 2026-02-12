#!/bin/bash
# 打印群聊信息和日志
# 输出格式：name + 明文 content + 时间
# 从 group-list-history.log 读取（项目根目录）

cd "$(dirname "$0")/.."
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
HISTORY_FILE="$ROOT_DIR/group-list-history.log"

if [ ! -f "$HISTORY_FILE" ]; then
  echo "ℹ️ 暂无群聊记录 ($HISTORY_FILE 不存在)"
  exit 0
fi

echo "📋 群聊信息 (name | content | 时间)"
echo "----------------------------------------"
node -e "
const fs = require('fs');
const path = process.argv[1];
if (!path || !fs.existsSync(path)) process.exit(0);
const lines = fs.readFileSync(path, 'utf-8').trim().split('\n').filter(Boolean);
lines.forEach(line => {
  try {
    const o = JSON.parse(line);
    const ui = o.userInfo || {};
    const name = ui.name || ui.nickName || '未知';
    const content = (o.content || '').replace(/\n/g, ' ');
    const ts = o.timestamp ? new Date(o.timestamp).toLocaleString('zh-CN') : '-';
    console.log(name + ' | ' + content + ' | ' + ts);
  } catch (_) {}
});
" "$HISTORY_FILE"
