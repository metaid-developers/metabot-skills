#!/bin/bash
# 让小橙监听群聊信息并对最新消息进行回复
# 群组使用 config.json 中的 groupId（或环境变量 GROUP_ID）
# 检测到新消息时由小橙生成回复并发送到群内（被 @小橙 时会优先由小橙回复）
#
# 用法: ./run_xiaocheng_listener.sh [--no-open]
#   --no-open: 在当前终端后台启动，不新开系统终端（默认会尝试在 Terminal.app 中启动）
#
# 关闭监听: ./scripts/stop_group_chat_listener.sh
# 查看日志: ./scripts/tail_group_chat.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
exec "$SCRIPT_DIR/run_group_chat_listener.sh" "小橙" "$@"
