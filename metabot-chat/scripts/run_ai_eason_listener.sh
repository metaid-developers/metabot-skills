#!/bin/bash
# 让 AI Eason 监听群聊信息，并在监听到新消息后由 AI Eason 进行回复
# 群组使用 config.json 中 groupInfoList[0] 的 groupId（或环境变量 GROUP_ID）
#
# 用法: ./run_ai_eason_listener.sh [--no-open]
#   --no-open: 在当前终端后台启动，不新开系统终端（默认会尝试在 Terminal.app 中启动）
#
# 关闭监听: ./scripts/stop_group_chat_listener.sh
# 查看日志: ./scripts/tail_group_chat.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
exec "$SCRIPT_DIR/run_group_chat_listener.sh" "AI Eason" "$@"
