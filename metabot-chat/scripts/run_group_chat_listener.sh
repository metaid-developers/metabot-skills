#!/bin/bash
# 群聊监听启动脚本
# 当用户说「开启群聊」「监听群聊」「让 XX Agent 监听群聊信息」等时，由 metabot-chat skills 自动调用
# 默认在系统自带终端（Terminal.app）中启动监听，以保证网络权限、避免 fetch 失败
#
# 用法: ./run_group_chat_listener.sh [group_id] [agent_name] [log_file]
#       不传 agent_name 或加 --all-agents：所有群内 Agent 参与（被 @ 优先）
#       加 --discussion：对最新消息进行话题讨论（多 Agent 轮流发言，优先被 @ 的开场）
#       可选: --no-open 在当前终端后台启动（不新开系统终端）
# 示例: ./run_group_chat_listener.sh "AI Eason"        # 仅 AI Eason 回复
#       ./run_group_chat_listener.sh --all-agents       # 所有 Agent 监听并回复
#       ./run_group_chat_listener.sh --all-agents --discussion  # 监听并对最新消息话题讨论

cd "$(dirname "$0")/.."
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CHAT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
LISTENER_PID_FILE="$ROOT_DIR/.group_chat_listener.pid"

# 解析参数：支持 --no-open、--all-agents、--discussion
USE_SYSTEM_TERMINAL=true
USE_ALL_AGENTS=false
REPLY_MODE=""   # reply | discussion
ARGS=()
for arg in "$@"; do
  case "$arg" in
    --no-open)     USE_SYSTEM_TERMINAL=false ;;
    --all-agents)  USE_ALL_AGENTS=true ;;
    --discussion)  REPLY_MODE="discussion" ;;
    *)             ARGS+=("$arg") ;;
  esac
done

GROUP_ID="${ARGS[0]:-}"
AGENT_NAME="${ARGS[1]:-}"
LOG_FILE="${ARGS[2]:-group_chat_listener.log}"

# --all-agents：强制所有 Agent 参与回复，不指定单个回复者
if [ "$USE_ALL_AGENTS" = true ]; then
  AGENT_NAME=""
fi

# 若只传一个参数且不是群ID格式，则视为 agent_name（除非已 --all-agents）
if [ -n "$GROUP_ID" ] && [ -z "$AGENT_NAME" ] && [ "$USE_ALL_AGENTS" = false ] && [[ ! "$GROUP_ID" =~ ^[a-f0-9]+i[0-9]+$ ]]; then
  AGENT_NAME="$GROUP_ID"
  GROUP_ID=""
fi

run_in_current_shell() {
  echo "🔄 启动群聊监听（当前终端后台）"
  [ -n "$GROUP_ID" ] && echo "   群组: $GROUP_ID"
  if [ "$REPLY_MODE" = "discussion" ]; then
    echo "   模式: 话题讨论（对最新消息多 Agent 讨论，优先被 @ 的开场）"
    [ -n "$AGENT_NAME" ] && echo "   优先开场: $AGENT_NAME"
  elif [ -n "$AGENT_NAME" ]; then
    echo "   指定回复者: $AGENT_NAME"
  else
    echo "   回复者: 所有群内 Agent（被 @ 优先，否则随机）"
  fi
  echo "   日志文件: $LOG_FILE"
  echo ""
  nohup env GROUP_ID="$GROUP_ID" AGENT_NAME="$AGENT_NAME" REPLY_MODE="$REPLY_MODE" npx ts-node scripts/group_chat_listener.ts >> "$CHAT_DIR/$LOG_FILE" 2>&1 &
  PID=$!
  echo "$PID" > "$LISTENER_PID_FILE"
  echo "✅ 监听群聊功能已开启"
  echo ""
  echo "   【关闭监听】执行以下命令停止后台进程："
  echo "   ./scripts/stop_group_chat_listener.sh"
  echo "   或: kill \$(cat $LISTENER_PID_FILE)"
  echo ""
  echo "   【查看群聊信息】在终端执行以下命令可随时查看群聊消息（name + content + 时间）："
  echo "   ./scripts/tail_group_chat.sh"
  echo ""
}

run_in_system_terminal() {
  echo "🔄 使用系统自带终端启动群聊监听（推荐，可避免 fetch 失败）"
  [ -n "$GROUP_ID" ] && echo "   群组: $GROUP_ID"
  if [ "$REPLY_MODE" = "discussion" ]; then
    echo "   模式: 话题讨论（对最新消息多 Agent 讨论，优先被 @ 的开场）"
    [ -n "$AGENT_NAME" ] && echo "   优先开场: $AGENT_NAME"
  elif [ -n "$AGENT_NAME" ]; then
    echo "   指定回复者: $AGENT_NAME"
  else
    echo "   回复者: 所有群内 Agent（被 @ 优先，否则随机）"
  fi
  echo "   日志文件: $LOG_FILE"
  echo ""

  if [[ "$(uname)" != "Darwin" ]]; then
    echo "   当前系统非 macOS，改为在当前终端后台启动"
    run_in_current_shell
    return
  fi

  # 将完整命令写入临时启动脚本，避免把中文/特殊字符传给 osascript 导致 AppleScript 语法错误
  LAUNCH_SCRIPT="$CHAT_DIR/.group_listener_launch.sh"
  cat > "$LAUNCH_SCRIPT" << LAUNCHEOF
#!/bin/bash
cd "$CHAT_DIR"
nohup env GROUP_ID="$GROUP_ID" AGENT_NAME="$AGENT_NAME" REPLY_MODE="$REPLY_MODE" npx ts-node scripts/group_chat_listener.ts >> "$LOG_FILE" 2>&1 &
echo \$! > "$LISTENER_PID_FILE"
echo ""
echo "✅ 群聊监听已在系统终端后台运行"
echo "   关闭: cd $CHAT_DIR && ./scripts/stop_group_chat_listener.sh"
echo "   日志: ./scripts/tail_group_chat.sh"
LAUNCHEOF
  chmod +x "$LAUNCH_SCRIPT"

  # 将 AppleScript 写入临时文件再执行，避免 -e 多段拼接时的引号/转义导致语法错误
  CHAT_DIR_AS=$(printf '%s' "$CHAT_DIR" | sed 's/\\/\\\\/g; s/"/\\"/g; s/&/\\&/g')
  ASCPT_FILE="${TMPDIR:-/tmp}/metaid_open_term_$$.scpt"
  cat > "$ASCPT_FILE" << 'APPLESCRIPTEOF'
set chatDir to "CHAT_DIR_PLACEHOLDER"
set runCmd to "cd " & quoted form of chatDir & " && ./.group_listener_launch.sh"
tell application "Terminal" to do script runCmd
APPLESCRIPTEOF
  sed -i '' "s|CHAT_DIR_PLACEHOLDER|$CHAT_DIR_AS|g" "$ASCPT_FILE"
  OSA_OUT=$(osascript "$ASCPT_FILE" 2>&1)
  OSA_ERR=$?
  rm -f "$ASCPT_FILE"

  if [ $OSA_ERR -ne 0 ] || echo "$OSA_OUT" | grep -q "script error\|Connection invalid\|syntax error"; then
    echo "⚠️ 当前环境无法自动打开系统终端（如 Cursor 沙箱限制），请在本机 Terminal.app 中执行以下命令以启动监听："
    echo ""
    echo "   cd $CHAT_DIR && ./.group_listener_launch.sh"
    echo ""
    echo "   （上述脚本已包含本次指定的群组与回复者，直接执行即可）"
    echo ""
  else
    echo "✅ 已在系统终端（Terminal.app）中自动打开并启动监听"
  fi
  echo ""
  echo "   【关闭监听】在系统终端或本机任意终端执行："
  echo "   cd $CHAT_DIR && ./scripts/stop_group_chat_listener.sh"
  echo ""
  echo "   【查看群聊日志】执行："
  echo "   cd $CHAT_DIR && ./scripts/tail_group_chat.sh"
  echo ""
}

if [ "$USE_SYSTEM_TERMINAL" = true ]; then
  run_in_system_terminal
else
  run_in_current_shell
fi
