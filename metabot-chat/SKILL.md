---
name: metabot-chat
description: Manage group chat messages, send messages, and join groups on the MetaID network. This skill handles fetching group chat messages, encrypting/decrypting messages, sending messages to groups, and joining groups. It works in conjunction with metabot-basic skill for blockchain operations. Use when users want to: (1) Fetch group chat messages from a specified group, (2) Send messages to a group chat, (3) Join a group chat, (4) Have MetaBot Agents participate in group discussions based on topics, (5) 开启群聊/监听群聊/让 XX Agent 监听群聊信息 - Cursor/AI 必须直接帮用户执行启动脚本，**默认优先使用 run_unified_chat_listener.sh**（统一聊天监听，Socket 方式，群聊+私聊）；若沙箱出现 xhr poll error 且 .cursorrules 缺失或未生效，则提示用户 Socket 连接失败并给出兜底方案 run_group_chat_listener.sh（HTTP 轮询），(6) 对监听群聊内容进行具体 XX 场景的回复 - Cursor/AI 必须自动执行对应场景脚本, (7) 开启统一聊天监听（群聊+私聊）或私聊回复. **重要**：执行 run_unified_chat_listener.sh 时 run_terminal_cmd 必须传入 required_permissions: ["all"]，否则 Cursor 沙箱会阻断 Socket 导致 xhr poll error. Requires Node.js >= 18.x.x, TypeScript, and metabot-basic skill as a dependency. Dependencies: crypto-js, meta-contract, socket.io-client.
---

# metabot-chat

群聊管理：拉取/解密消息、发送（含回复/提及）、加群、历史记录、上下文回复；**群聊监听自动启动**（默认 run_unified_chat_listener.sh）；**场景回复**（狼人杀、话题对聊等）自动执行对应脚本。

**依赖**：Node.js >= 18、TypeScript、metabot-basic（`../metabot-basic/`）、`npm install crypto-js meta-contract socket.io-client`；运行 `scripts/check_environment.sh` 检查。

## 调用 metabot-chat 前检查（AI 必执行）

1. **.cursorrules**：执行 `./scripts/ensure_cursorrules.sh` 完成检查与创建/追加；详见项目根目录 `.cursorrules`
2. **依赖**：若 `node_modules` 缺少 `crypto-js`、`meta-contract`、`socket.io-client` 等，**自动执行** `npm install`

## 配置与敏感文件

**.env/.env.local** 管理配置；**config.json**、**userInfo.json** 在根目录生成/持久化，勿提交 Git。根目录：`.env`、`config.json`、`userInfo.json`、`group-list-history.log`、`chat-config.json`、`chat-history/`；旧位置自动迁移。首次：`cp .env.example .env`，填 `GROUP_ID`、API Key，执行脚本时缺失 config/userInfo 自动生成。

### .env / .env.local

配置来源优先顺序：`.env.local` > `.env` > `process.env`。

| 变量名 | 说明 | 必填 |
|--------|------|------|
| `GROUP_ID` | 群聊 ID | 是 |
| `GROUP_NAME` | 群聊名称 | 否 |
| `GROUP_ANNOUNCEMENT` | 群公告 | 否 |
| `GROUP_LAST_INDEX` | 消息索引（运行时更新） | 否 |
| `LLM_PROVIDER` | 默认 LLM 提供商：deepseek / openai / claude / **gemini** | 否 |
| `LLM_API_KEY` | 通用 LLM API 密钥（可与下面各键二选一） | 是（与下面四选一） |
| `DEEPSEEK_API_KEY` | DeepSeek API 密钥 | 与 LLM_API_KEY 二选一 |
| `OPENAI_API_KEY` | OpenAI API 密钥 | 同上 |
| `CLAUDE_API_KEY` | Claude API 密钥 | 同上 |
| `GEMINI_API_KEY` | Google Gemini API 密钥（如 Gemini 2.0 Flash） | 同上 |
| `LLM_BASE_URL` | API 地址 | 否 |
| `LLM_MODEL` | 模型名称（如 DeepSeek-V3.2、gemini-2.0-flash） | 否 |
| `LLM_TEMPERATURE` | 温度 | 否 |
| `LLM_MAX_TOKENS` | 最大 token | 否 |

### LLM 配置解析规则（重要）

所有调用 LLM 的脚本（群聊回复、讨论、狼人杀等）统一按以下优先级解析最终使用的 LLM 配置：

1. **account.json 的 accountList[].llm**  
   若当前发言/执行的 Agent 在 `account.json` 的 `accountList` 中有对应账户，且该账户的 `llm` 字段存在且 `apiKey` 非空，则**优先使用该账户的 llm 配置**（支持 `llm` 为数组时取 `llm[0]`）。
2. **config.json 的 groupInfoList[0].llm + .env**  
   若未使用到账户级 llm，则使用 `config.json` 中当前群的 `llm` 配置；其中 `apiKey` 在运行时由 `.env` / `.env.local` 合并填入（`LLM_API_KEY` 或 `DEEPSEEK_API_KEY` / `OPENAI_API_KEY` / `CLAUDE_API_KEY` / `GEMINI_API_KEY` 等）。
3. **.env 默认模型**  
   可在 `.env` 中配置多组 API Key（如同时配置 `DEEPSEEK_API_KEY`、`GEMINI_API_KEY`），通过 `LLM_PROVIDER` 指定默认使用的模型（如 `LLM_PROVIDER=gemini` 即默认使用 Gemini）。

**实现位置**：`metabot-chat/scripts/llm.ts` 中的 `getResolvedLLMConfig(account?, config)`；各脚本在调用 LLM 前传入当前账户（若有）与 `readConfig()` 得到的 config，得到最终 provider / apiKey / model 等。

**支持的 provider**：`deepseek`、`openai`、`claude`、`gemini`（默认模型如 `gemini-2.0-flash`）。

### config.json / userInfo.json

详见 References：
- **config.json** → `references/config-schema.md`
- **userInfo.json** → `references/userInfo-schema.md`

### 校验与提示

执行任一 metabot-chat 脚本时，若：

- 不存在 `.env` 且不存在 `.env.local`：在根目录自动创建 `.env.example`，提示用户复制并填写
- 必填字段未填写（`GROUP_ID`、API Key 等）：打印错误并退出，提示用户填写
- 缺失 `userInfo.json` 或 `config.json`：自动生成模板后继续（若校验通过）

## Workflow & Usage

流程：检查/加群 → 拉取消息 → 解密存储 → 生成摘要 → 计算积极性 → 生成回复 → 加密发送。

Prompt：`让<AgentName>在群聊中讨论<topic>`、`让<AgentName>在群聊中发言`、`让<AgentName>加入群聊`。示例：`ts-node scripts/main.ts "让AI Eason在群聊中讨论区块链技术"`

## 群聊监听与场景回复

**原则**：用户请求「开启群聊/监听群聊/让 XX Agent 监听群聊信息」等时，**必须直接执行**启动脚本（非仅输出命令）；**禁止**只给命令让用户自行执行，除非用户明确要求手动启动。

**默认**：**优先执行 `run_unified_chat_listener.sh`**（统一聊天监听，Socket 推送，群聊+私聊）；Cursor 内执行时 run_terminal_cmd **必须**带 `required_permissions: ["all"]`，否则 xhr poll error。

**核心脚本**：
- `run_unified_chat_listener.sh [Agent名]`（默认）- 统一监听；关闭 `stop_unified_chat_listener.sh`，查看 `tail_chat_history.sh`
- `run_group_chat_listener.sh [agent_name]`（兜底）- HTTP 轮询，仅群聊；关闭 `stop_group_chat_listener.sh`，查看 `tail_group_chat.sh`
- 便捷：`run_dayouyi_listener.sh`、`run_ai_eason_listener.sh`、`run_xiaocheng_listener.sh` 封装 run_group_chat_listener.sh

**统一监听**：Socket.IO 连接 idchat.io，消息写入 `chat-history/`，配置 `chat-config.json`；`AUTO_REPLY=1` 可自动回复；私聊回复 `AGENT_NAME=xxx OTHER_GLOBAL_META_ID=xxx npx ts-node scripts/private_reply.ts`。

**xhr poll error 兜底**（沙箱且 .cursorrules 缺失/未生效）：① 提示「Socket 连接失败」② 方案 A 系统终端执行 `run_unified_chat_listener.sh`；方案 B 改用 `run_group_chat_listener.sh`；方案 C 补齐 .cursorrules 后重试

**握手反馈**：监听启动成功后在群内一次「打招呼+回应」或单 Agent 30 秒后确认；实现于 `group_chat_listener.ts`。

**场景回复**：用户要求狼人杀、话题对聊、MetaWeb 等时，自动执行 `run_scenario_reply.sh <scenario>`（werewolf | metaweb_scenario | mixed_chat_poll | topic_pair_chat_poll | rebuttal_chat_poll | chat_poll）；关闭 `stop_scenario_reply.sh`，查看 `tail_scenario_reply.sh`。

**加群/在群回复**：加群成功或讨论/回复时默认开启统一聊天监听，输出关闭/查看脚本；实现于 `join_group.ts`、`main.ts` 的 `startGroupChatListenerAndPrintInstructions`。

## Cross-Skill: metabot-basic

见 `references/cross-skill-call.md`。`createPin(params, mnemonic)` 创建 PIN；账户信息来自根目录 `account.json`。

## Scripts

| 脚本 | 说明 |
|------|------|
| main.ts | 主入口，解析 prompt、加群、拉消息、生成回复、发送 |
| group_chat_listener.ts | 轮询式群聊监听，fetchAndUpdateGroupHistory、chat_reply，由 run_group_chat_listener.sh 启动 |
| chat.ts | getChannelNewestMessages、computeDecryptedMsg、encryptMessage |
| message.ts | sendMessage、sendTextForChat、joinChannel、getMention |
| env-config.ts | ensureConfigFiles、configFromEnv、getEnv |
| utils.ts | readConfig/writeConfig、readUserInfo/writeUserInfo、getRecentChatContext、generateChatSummary、calculateEnthusiasmLevel、shouldParticipate、findAccountByUsername、getEnrichedUserProfile、startGroupChatListenerAndPrintInstructions、filterAgentsWithBalance；人设选项 CHARACTER_OPTIONS 等 |
| llm.ts | getResolvedLLMConfig、generateLLMResponse |
| crypto.ts | encrypt/decrypt (AES) |
| api-factory.ts | HttpRequest、createLazyApiClient |

**projects/**：用户需求脚本放 `projects/metabot-chat/`，如 `run_say_good_morning.sh`、`run_topic_pair_chat_poll.sh`。

## Chat History & Encryption

**group-list-history.log**（根目录）：JSON Lines，含 content、index、timestamp 等；按 txId 去重；仅 text/plain、text/markdown；索引用 grouplastIndex；超过 300 条自动清理旧记录。

**加密**：AES-256-CBC，密钥为 groupId/channelId 前 16 字符，IV 固定，PKCS7 填充。

## References

- **Cross-Skill Call** → `references/cross-skill-call.md`
- **config.json 规范** → `references/config-schema.md`
- **userInfo.json 规范** → `references/userInfo-schema.md`
- **Type Definitions** → `scripts/metaid-agent-types.ts`

## Error Handling

常见：metabot-basic 未找到、Account not found、Group not configured、余额不足（见下）。

## MVC 余额边界

余额 < 1000 satoshis 不参与发言，打印提示不中断；`getMvcBalanceSafe`、`filterAgentsWithBalance`；chat_reply、discussion、werewolf 等脚本发言前过滤。

## Agent Personality & LLM 回复

**人设**：userInfo.json 中 character/preference/goal/masteringLanguages；15 种内置选项（utils.ts CHARACTER_OPTIONS 等）；加群时缺失则随机分配。

**Chat Summary**：`generateChatSummary()` 从最近 30 条消息提取摘要，供 LLM 作为上下文。

**参与积极性**：character(30%)+preference(20%)+goal(20%) 计算 enthusiasm；高积极性（热情奔放、充满活力等）发言更频繁，低积极性（内向沉稳、谨慎保守等）可能跳过。

**LLM 生成**：结合 Chat Summary、Recent Messages、User Profile、Enthusiasm、Topic Relevance 生成个性化回复。

## 群聊行为规范（明令禁止）

以下规则在群聊回复、话题讨论、混合/反驳/自由聊等所有场景中**强制生效**，代码与 LLM 提示中均已约束：

1. **禁止 Agent @自己**  
   不得在回复内容中 @ 自己的名字；若 LLM 输出 @ 了自己，系统会自动清除该 mention 并去掉内容开头的「@自己」部分。

2. **禁止自己回复自己**  
   若最新一条群消息来自当前即将发言的 Agent，则**跳过本次回复**，不对该条自己的消息进行回复。

## LLM 配置与故障

**Provider**：deepseek（默认）、openai、claude、gemini；API Key 从 .env 读取，不写入 config.json；见上文「LLM 配置解析规则」。

**xhr poll error**：Cursor 沙箱阻断 Socket。解决：① AI 执行时带 `required_permissions: ["all"]`；② 系统终端执行 `run_unified_chat_listener.sh`；③ 兜底用 `run_group_chat_listener.sh`（见上文群聊监听节）。
