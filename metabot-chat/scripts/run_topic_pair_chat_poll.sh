#!/bin/bash
# 话题对聊 - 1 反驳型 + 1 正常型 Agent 持续讨论（委托 projects 脚本执行）

cd "$(dirname "$0")/../.."
bash projects/metabot-chat/run_topic_pair_chat_poll.sh "$@"
