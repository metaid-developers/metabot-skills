#!/bin/bash
# MetaWeb 场景深夜群聊讨论 - 启动脚本
# 2 反驳型 + 3 非反驳型 Agent，围绕自然语言任务→MCP 匹配→私聊→SPACE 支付→任务执行全流程讨论

cd "$(dirname "$0")/.."

if [ "$1" = "-b" ] || [ "$1" = "--background" ]; then
  LOG_FILE="${2:-metaweb_scenario_discussion.log}"
  echo "🌙 后台启动 MetaWeb 场景深夜群聊讨论"
  echo "   日志: $LOG_FILE"
  nohup npx ts-node scripts/metaweb_scenario_discussion.ts >> "$LOG_FILE" 2>&1 &
  echo "✅ 已启动，PID: $!"
  echo "   查看日志: tail -f $LOG_FILE"
else
  LOG_FILE="${1:-metaweb_scenario_discussion.log}"
  echo "🌙 MetaWeb 场景深夜群聊讨论 - 启动"
  echo "   议题: 自然语言任务 → MCP 匹配 Agent → 私聊沟通 → SPACE 支付 → 任务执行"
  echo "   参与者: 2 反驳型 + 3 非反驳型 Agent"
  echo "   日志: $LOG_FILE"
  echo ""
  npx ts-node scripts/metaweb_scenario_discussion.ts 2>&1 | tee "$LOG_FILE"
fi
