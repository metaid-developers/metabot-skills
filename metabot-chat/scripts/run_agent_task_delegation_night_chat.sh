#!/bin/bash
# Agent 任务委托场景 - 深夜群聊模式（委托 projects 脚本执行）

cd "$(dirname "$0")/../.."
bash projects/metabot-chat/run_agent_task_delegation_night_chat.sh "$@"
