---
name: metabot-basic
description: Create and manage MetaID wallets and accounts. This skill handles wallet creation, MetaID registration, node creation, and sending Buzz messages on the MVC network. Use when users want to: (1) Create a new MetaBot (MetaID Agent)/robot/proxy with a wallet, (2) Register a MetaID account, (3) Create MetaID nodes, (4) Send Buzz messages to the MVC network. Requires Node.js >= 18.x.x and TypeScript. Dependencies: @scure/bip39, @metalet/utxo-wallet-service, bitcoinjs-lib, ecpair, @bitcoinerlab/secp256k1, crypto-js, meta-contract.
---

# metabot-basic

metabot-basic skill provides comprehensive wallet and MetaID account management capabilities for the MVC network. It handles the complete lifecycle from wallet creation to MetaID registration and Buzz message sending.

## Core Capabilities

1. **Wallet Creation** - Generate mnemonic phrases and derive addresses for MVC, BTC, and DOGE chains
2. **MetaID Registration** - Register new MetaID accounts with gas subsidies (including MVC init rewards)
3. **MetaID Node Creation** - Create MetaID nodes with custom usernames on MVC and DOGE chains
4. **Buzz Messaging** - Send Buzz messages to the MVC network using simpleBuzz protocol
5. **Generic MetaID PIN Operations** - Use a unified `createPin` API to create or modify arbitrary MetaID protocol nodes (including custom protocols)
6. **钱包内置方法** - `signTransaction`（对交易单输入签名）、`pay`（使用 account.json 当前用户为交易支付并签名）、`getNetwork`（异步返回当前网络）；本地 DOGE 钱包实现见 `doge-wallet-local.ts`（`LocalDogeWallet`、`getDogeNetwork`、`getDogeDerivationPath`、`deriveDogeAddress`、`isValidDogeAddress` 等）

## Prerequisites

Before using this skill, ensure:
- Node.js >= 18.x.x is installed
- TypeScript is installed globally or available in the project
- All required dependencies are installed (see Dependencies section)

Run `scripts/check_environment.sh` to verify the environment.

## Dependencies

This skill requires the following npm packages with specific versions:
- `@scure/bip39@1.6.0`
- `@metalet/utxo-wallet-service@0.3.33-beta.5`
- `bitcoinjs-lib@6.1.7`
- `ecpair`
- `@bitcoinerlab/secp256k1@1.2.0`
- `crypto-js`
- `meta-contract`
- `sharp` - 头像压缩（Node.js 环境）

Install dependencies with:
```bash
npm install
```

## Workflow Overview

The metabot-basic workflow consists of three main phases:

1. **Wallet Creation** - Generate mnemonic, derive addresses, save to `account.json` (project root)
2. **MetaID Registration** - Claim gas subsidy, create MetaID node with username
3. **Buzz Creation** - Send initial Buzz message to the network

## Usage

### Trigger Detection

The skill activates when user prompts contain keywords like:
- "我要创建一个 MetaID Agent"
- "我要创建一个代理"
- "我要创建一个机器人"
- "创建 MetaID 钱包"
- "注册 MetaID"

### Wallet Selection Logic

1. **New Wallet Creation**: Triggered when keywords indicate creation intent
2. **Existing Wallet Selection**: 
   - If root `account.json` exists with accounts, match by username/address from user prompt
   - If no match found, use accountList[0] as default
   - New wallets are unshifted to the front of accountList

### Main Execution Flow

Execute the main script:
```bash
ts-node scripts/main.ts "<user_prompt>"
```

The script will:
1. Check environment prerequisites
2. Parse user prompt for username and buzz content
3. Determine if wallet creation or selection is needed
4. Create/select wallet and save to root `account.json`
5. Register MetaID if userName is empty
6. Create MetaID node with username
7. Fetch user info by address to get globalMetaId and update root `account.json`
8. Send Buzz message if content is provided

## Account Management

Account data is stored in `account.json` at the **project root** (MetaApp-Skill/) with the following structure:

```json
{
  "accountList": [
    {
      "mnemonic": "word1 word2 ... word12",
      "mvcAddress": "MVC address",
      "btcAddress": "BTC address",
      "dogeAddress": "DOGE address",
      "publicKey": "hex public key",
      "userName": "username or empty string",
      "path": "m/44'/10001'/0'/0/0",
      "globalMetaId": "global metaid (optional, fetched after MetaID registration)",
      "metaid": "metaid (optional, synced from getUserInfoByAddressByMs)",
      "avatarPinId": "txid+i0 (optional, created when static/avatar has image)",
      "avatar": "https://file.metaid.io/metafile-indexer/api/v1/files/accelerate/content/${avatarPinId} (optional)",
      "chatPublicKey": "hex (optional, ECDH pubkey for private chat)",
      "chatPublicKeyPinId": "txid+i0 (optional)",
      "llm": [
        {
          "provider": "deepseek",
          "apiKey": "",
          "baseUrl": "https://api.deepseek.com",
          "model": "DeepSeek-V3.2",
          "temperature": 0.8,
          "maxTokens": 500
        }
      ]
    }
  ]
}
```

**Important Note**: 
- Account file location: **project root** `account.json` (shared with metabot-chat).
- If `metabot-basic/account.json` exists, it will be migrated to root on first run.
- Empty accounts (accounts with empty mnemonic) are automatically filtered out when writing.
- **llm**：数组格式，`llm[0]` 默认从 `.env` / `.env.local` 读取；用户可手动添加 `llm[1]`、`llm[2]` 等；未指定时默认使用 `llm[0]`；旧格式（对象）会自动迁移为 `[llm]`。
- **metaid**：创建 Agent 后调用 `getUserInfoByAddressByMs`，若返回 `metaId` 则同步到 account.json 和根目录 userInfo.json。
- **avatarPinId**：若 `metabot-basic/static/avatar` 下有图片文件（jpg/png/gif/webp/avif），创建 namePin 成功后自动创建 avatar pin 并写入。
- **avatar**：格式为 `https://file.metaid.io/metafile-indexer/api/v1/files/accelerate/content/${avatarPinId}`，用于前端展示。
- **chatPublicKey**：创建 Agent 时若 `userInfo.chatPublicKey` 为空则自动创建 `/info/chatpubkey` 节点；也可通过 `create_chatpubkey.ts` 为已有 Agent 单独创建。
- **Agent 人设（character / preference / goal / masteringLanguages / stanceTendency / debateStyle / interactionStyle）**：在创建完 **name 节点** 时同时写入 `account.json` 的该账户下。若用户在提示词中指定（如「帮我生成一个 MetaID Agent，名字叫 Sam，性格 XXX，爱好 XXX，目标 XXX，擅长语言 XXX，立场 XXX，辩论风格 XXX，互动风格 XXX」），则按提示词填充；未指定则用系统默认策略 `getRandomItem` 分配。这些人设会在所有涉及 LLM 调用的场景中作为 config 传入（不限于群聊）。选项见 `utils.ts` 中的 `CHARACTER_OPTIONS`、`PREFERENCE_OPTIONS`、`GOAL_OPTIONS`、`LANGUAGE_OPTIONS`、`STANCE_OPTIONS`、`DEBATE_STYLE_OPTIONS`、`INTERACTION_STYLE_OPTIONS`。
- **path**：每个账户的推导路径，存于 `account.json` 的 `path` 字段。`wallet.ts` 的 `getPath(options?)` 会从**要操作的** accountList 项读取 path；新建 agent/新建钱包时使用 `getPath({ defaultPath: DEFAULT_PATH })`，默认值为 `m/44'/10001'/0'/0/0`。当用户在自然语言中指定「钱包路径使用1」或「钱包路径使用 m/44'/10001'/0'/0/1」时，主流程会通过 `extractWalletPathFromPrompt` 解析出对应 path/index，并据此设置新建账户的 `path` 与 `addressIndex`。
- **addressIndex**：`getCurrentWallet`、`getAddress`、`getPublicKey`、`getCredential`、`getUtxos`、`createPin`、`getEcdhPublickey`、`createBuzz` 等所有涉及当前账户的接口均支持在 options 中传入可选属性 `addressIndex`（不传则使用 0）。从 `account.path` 解析索引请使用 `parseAddressIndexFromPath(account.path)`；对于仅给出索引（如「路径1」）的情况，可通过 `buildPathFromIndex(1)` 得到 path 并保持与 `addressIndex` 一致。业务在操作已有 account 时应传入对应 `addressIndex` 以与 path 一致。详见 `references/wallet-operations.md`。

## Error Handling

All errors are logged to `log/error.md` with:
- Error message
- Method/function where error occurred
- Timestamp
- Execution context

## Scripts

- `check_environment.sh` - Validates Node.js and TypeScript installation
- `wallet.ts` - Wallet creation and address derivation; **内置方法**：`getMnemonicFromAccount`、`getNetwork`、`signTransaction`（使用 account.json 当前用户对 MVC 交易签名）
- `api.ts` - API functions for fetching UTXOs, broadcasting transactions, and claiming rewards
- `metaid.ts` - MetaID registration and node creation; **内置方法**：`pay`（使用 account.json 当前用户为 TxComposer 列表支付并签名）、`payTransactions`（需传入 mnemonic）
- `transfer.ts` - **MVC 转账** `sendSpace`（原生 SPACE / FT，amount 以 sats 传入）、**DOGE 转账** `sendDoge`；Space/sats 换算：`spaceToSats`、`toSats(amount, 'space'|'sats')`，1 Space = 10^8 sats
- `send_space.ts` - MVC 转账 CLI，执行前展示接收地址与金额并人机确认（可加 `--confirm` 跳过）
- `send_doge.ts` - DOGE 转账 CLI，最小 0.01 DOGE，可选人机确认
- `doge.ts` - DOGE chain specific inscription and transaction building functions
- `doge-wallet-local.ts` - 本地 DOGE 钱包实现（不依赖 metalet）：`LocalDogeWallet`、`getDogeNetwork`、`getDogeDerivationPath`、`deriveDogeAddress`、`deriveDogePublicKey`、`isValidDogeAddress`
- `buzz.ts` - Buzz message creation and sending
- `avatar.ts` - 头像压缩与处理（从 static/avatar 读取图片，Node.js 环境使用 sharp）
- `chatpubkey.ts` - ECDH 生成 chatpubkey（供私聊用）
- `env-config.ts` - 从 .env / .env.example 读取 LLM 等配置
- `create_agents.ts` - 批量创建 MetaID Agent（支持头像、metaid 同步、chatpubkey、llm）
- `create_chatpubkey.ts` - 为指定 Agent 创建 chatpubkey 节点
- `main.ts` - Main orchestration script

### 头像设置

将图片文件（jpg/png/gif/webp/avif）放入 `metabot-basic/static/avatar` 目录，执行 `create_agents.ts` 创建 Agent 时会自动创建 avatar pin 并写入 `avatarPinId`。

**为已有 Agent 单独设置头像**：`npm run create-avatar -- "AI Eason"`（需先确保 `static/avatar` 下有图片）

- **文件大小**：需小于 1MB，超过时提示「上传头像文件超过1 MB，请使用小于1MB图片文件设置头像」并跳过头像创建
- **无图片**：若无图片则提示并跳过头像创建

### MVC / DOGE 转账

- **MVC 转账（Space）**：当用户说「让 XXX 向 xxx 地址转账 xxx Space」或「让 XXX 向 MVC xxx 地址转账 xxx sats」时，使用 `sendSpace`（amount 统一用 **sats** 传入）。Space 与 sats 换算：1 Space = 10^8 sats；若用户说「0.001 space」则 amount = 0.001 * 10^8 = 100000；若说「1000 sats」则 amount = 1000。若用户仅说「sats」且未指定网络，需提示用户选择网络（MVC/BTC 等）。
- **人机确认**：每次调用 `sendSpace` 前应展示「接收地址、接收金额」，待人机确认后再执行。CLI：`npm run send-space -- "AI Eason" "<MVC地址>" 0.001 space` 或 `... 100000 sats`，加 `--confirm` 可跳过交互确认。
- **DOGE 转账**：`sendDoge(params, options)`，最小 0.01 DOGE（1,000,000 satoshis）。CLI：`npm run send-doge -- "AI Eason" "<DOGE地址>" 1000000 [--confirm]`。

### 单独创建 chatpubkey

```bash
npm run create-chatpubkey -- "AI Eason"
# 或 npx ts-node scripts/create_chatpubkey.ts <userName|mvcAddress|metaid>
```

### 同步 metaid 信息

```bash
npm run sync-agent-metaid -- "AI Eason"
```

### LLM 配置（数组格式）

- `llm` 为数组：`llm[0]` 默认来自 .env，创建 Agent 时自动写入
- 用户可手动添加 `llm[1]`、`llm[2]` 等
- 调用时若未指定使用哪一个，默认使用 `llm[0]`
- 工具函数 `getAccountLLM(account, index?)`：获取指定下标的 LLM 配置，index 默认 0
- 旧格式（`llm: {...}`）读写时自动迁移为 `llm: [{...}]`
- 为已有账户补充 llm[0]：`npm run sync-account-llm`

### 钱包内置方法（account.json 当前用户）

以下方法从 **account.json** 的当前操作用户（默认 `accountList[0]`，可通过 `accountIndex` 指定）读取 mnemonic，无需调用方传入：

- **signTransaction**（`wallet.ts`）：对单笔 MVC 交易的指定输入签名。参数 `(params: { transaction: ToSignTransaction }, returnsTransaction?, options?: { addressIndex?, accountIndex? })`；`returnsTransaction === true` 时返回 `{ txHex, txid }`，否则返回 `{ publicKey, r, s, sig, sigtype, txid }`。
- **pay**（`metaid.ts`）：为多笔 TxComposer 序列支付（选 UTXO、找零、签名）。参数 `(toPayTransactions, hasMetaid?, feeb?, options?: { addressIndex?, accountIndex? })`，返回已签名的 tx 序列化字符串数组。
- **getNetwork**（`wallet.ts`）：`Promise<Net>`，返回当前网络（与 `getNet()` 一致）。
- **getMnemonicFromAccount**（`wallet.ts`）：`(options?: { accountIndex? }) => { mnemonic, addressIndex }`，供其他模块获取当前账户 mnemonic 与派生索引。

本地 DOGE 钱包（不依赖 @metalet/utxo-wallet-service）见 `doge-wallet-local.ts`：`LocalDogeWallet`、`getDogeNetwork`、`getDogeDerivationPath`、`deriveDogeAddress`、`deriveDogePublicKey`、`isValidDogeAddress`。

## Generic `createPin` 与常用协议示例

- **通用入口**：`createPin(params: CreatePinParams, mnemonic: string, options?: { addressIndex?: number })`（定义于 `metaid.ts`）。
- **path 小写规范**：所有 `metaidData.path` 在上链前会被统一转为小写；若调用方传入大写字母，将自动转换为小写再写入链上。
- **modify 语义约束**：
  - 当 `operation: 'modify'` 时，必须在 `path` 中通过 `@<pinId>/protocols/{protocolName}` 的形式**显式指定要修改的 pinId**。
  - 若未满足该格式（例如缺少 `@pinId` 或未包含 `/protocols/...`），`createPin` 会抛出错误，提示需要传入要修改的 `pinId`。
- **常用协议参考**（均通过 `metaidData` + `CreatePinParams` 调用 `createPin` 上链）：
  - 点赞：`/protocols/paylike`，字段示例：`{ isLike: "1", likeTo: <目标 pinId> }`
  - 发帖 / Buzz：`/protocols/simplebuzz`，字段示例：`{ content, contentType: 'text/plain;utf-8', attachments: [], quotePin }`
  - 评论：`/protocols/paycomment`，字段示例：`{ content, contentType: 'text/plain;utf-8', commentTo: <被评论 pinId> }`
  - 打赏：`/protocols/simpledonate`，字段示例：`{ createTime, to, coinType, amount, toPin, message }`

详细的 TypeScript 示例（含 SimpleBuzz create/modify、PayLike、PayComment、SimpleDonate 以及自定义 `simplenote` 协议示例）见 `references/metaid-protocol.md` 中的「Generic createPin Usage」与「Common Protocol Examples」章节。

## Cursor 人机交互与一键执行规范

当用户在 Cursor 对话中提出需要**执行某条命令或脚本**的需求时（例如「让 AI Eason 监听群聊信息并且当监听到新消息之后对其进行回复」），**不应在输出推荐方案后结束任务**，而应：

1. **先说明推荐方案**：简要说明已按需求接好的能力，以及推荐的一种或多种用法（如专用脚本、通用脚本等）。
2. **继续代为执行推荐方案**：在给出命令示例后，**不要停止**，应通过 Cursor 的终端或执行能力，**直接帮用户把推荐方案执行起来**（例如执行 `cd metabot-chat && ./scripts/run_ai_eason_listener.sh --no-open`）。
3. **便于用户一键确认**：执行方式应设计为「用户可在对话中通过接受/确认（如点击接受、确认运行）即可完成执行」，相当于**一键替用户跑起来**，而不是仅把命令贴在对话框里让用户自己复制到终端执行。

**原则**：当输出中包含「请执行以下命令」「在项目根目录下执行」「推荐方式如下」等让用户去跑某脚本的指引时，任务不应在此结束；应继续把该推荐命令实际执行起来，让用户只需在 Cursor 中确认/接受即可一键完成执行。

## References

For detailed implementation details, see:
- `references/wallet-operations.md` - Wallet creation and management (MVC, BTC, DOGE)
- `references/metaid-protocol.md` - MetaID registration and node creation
- `references/buzz-protocol.md` - Buzz message protocol
