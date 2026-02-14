#!/bin/bash
# 查看 chat-history 下所有会话的最近消息（用户名 | 明文内容 | 时间戳 | 来源）
# 用法: ./tail_chat_history.sh        # 打印最近消息
#       ./tail_chat_history.sh -f    # 持续监控新消息（每 3 秒刷新）

# 先解析脚本所在目录（不依赖当前工作目录）
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
CHAT_HISTORY_DIR="${ROOT_DIR}/chat-history"

if [ ! -d "$CHAT_HISTORY_DIR" ]; then
  echo "ℹ️ 暂无 chat-history 目录"
  exit 0
fi

print_logs() {
  CHAT_HISTORY_DIR="$CHAT_HISTORY_DIR" node -e "
    const fs = require('fs');
    const path = require('path');
    const dir = process.env.CHAT_HISTORY_DIR || process.argv[2];
    if (!dir || typeof dir !== 'string') {
      console.error('错误: chat-history 路径未设置');
      process.exit(1);
    }
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.log')).sort();
    for (const f of files) {
      const full = path.join(dir, f);
      const name = path.basename(f, '.log');
      console.log('--- ' + name + ' ---');
      const content = fs.readFileSync(full, 'utf-8');
      const lines = content.trim().split('\n').filter(Boolean).slice(-50);
      for (const line of lines) {
        try {
          const o = JSON.parse(line);
          const ui = o.userInfo || {};
          const from = (ui.name || ui.nickName || o.address || '未知').toString();
          const text = (o.content || '').replace(/\n/g, ' ').slice(0, 80);
          const ts = o.timestamp ? new Date(o.timestamp).toLocaleString('zh-CN') : '-';
          const src = o.groupId ? '群:' + (o.groupId || '').slice(0,8) : (o.otherGlobalMetaId ? '私聊' : '');
          console.log(from + ' | ' + text + ' | ' + ts + ' | ' + src);
        } catch (_) {}
      }
      console.log('');
    }
  "
}

if [ "$1" = "-f" ]; then
  echo "📋 持续监控 chat-history（Ctrl+C 退出）"
  echo "========================================"
  while true; do
    print_logs
    sleep 3
  done
else
  echo "📋 chat-history 最近消息"
  echo "========================================"
  print_logs
fi
