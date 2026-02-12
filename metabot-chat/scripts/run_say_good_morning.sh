#!/bin/bash
# 随机选取 3 个 Agent 在群里说早安（委托 projects 脚本执行）

cd "$(dirname "$0")/../.."
bash projects/metabot-chat/run_say_good_morning.sh
