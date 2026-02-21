---
name: metabot-basic
description: MetaBot 的基础身份与资产管理核心。负责创建 MetaBot 实体（钱包+MetaID）、管理链上资产（MVC/DOGE）、发布基础 Buzz 消息及设置头像。
---

# metabot-basic

MetaBot 生态的基础设施 Skill。管理 MetaBot 的**身份 (MetaID)**、**钱包 (Wallet)** 和**资产 (Assets)**。

## 核心工作流 (Workflows)

### 1. 创建 MetaBot (Identity Creation)
当用户指令涉及“创建 MetaBot”、“注册 MetaID”、“新建机器人/钱包”时，**必须直接执行**以下脚本。

- **脚本**: `npx ts-node scripts/create_agents.ts`，**必须**用以下两种方式之一传入 Agent 名称，否则会报错：
    - **推荐（单个）**: `npx ts-node scripts/create_agents.ts --name "<AgentName>"`  
      仅创建一个名为 `<AgentName>` 的 MetaBot。`<AgentName>` 为占位，替换为用户要求的名字（如 `xai`、`Alice`）。**不要**把 `--name` 当作名字，只把其后的一个参数当作名字。
    - **批量**: `npx ts-node scripts/create_agents.ts "<name1>" "<name2>"`  
      创建多个 MetaBot，每个参数一个名字；参数中**不要**包含 `--name`。
- **功能**: 生成助记词 -> 派生地址 -> 注册 MetaID (自动申请 Gas 补贴) -> 初始化 `account.json`。
- **头像选项 (Avatar)**:
    - **自动识别**: 若用户未指定，默认检查 `static/avatar/` 目录下是否有图片。
    - **指定路径**: 在名称后加 `--avatar "path/to/image.png"`，例如 `npx ts-node scripts/create_agents.ts --name "MyBot" --avatar "./avatar.png"`。
    - **独立设置**: 若 MetaBot 已存在但需补设头像，执行 `npx ts-node scripts/create_avatar.ts "MetaBotName" "path/to/image.png"`。

### 2. 资产转账 (Asset Transfer)
管理 MetaBot 的链上资金。执行前**必须请求用户二次确认**金额与地址。

- **MVC 转账 (Space)**:
    - **脚本**: `npx ts-node scripts/send_space.ts`
    - **注意**: 金额单位为 **sats** (1 Space = 10^8 sats)。
- **DOGE 转账**:
    - **脚本**: `npx ts-node scripts/send_doge.ts`
    - **限制**: 最小转账金额 0.01 DOGE。

### 3. 数据发布 (Data Publishing)
MetaBot 在链上发布基础数据或协议节点。

- **发布 Buzz**: `npx ts-node scripts/send_buzz.ts "<agentName>" "<content>"` (基于 `simpleBuzz` 协议)。
- **发布带图片附件的 Buzz**: 当用户要求将**本地图片**作为附件发 buzz，或使用**已有 pinId** 作为图片附件发 buzz 时，使用 `send_buzz_with_image.ts`。流程：先上链得 pinId（若为本地图片则调用 metabot-file 上传）→ 组装 simplebuzz `attachments: ["metafile://<pinId>.png"]` → 发送。
    - **本地图片**: `npx ts-node scripts/send_buzz_with_image.ts "<agentName>" "<content>" --image <path>`
    - **已有 pinId**: `npx ts-node scripts/send_buzz_with_image.ts "<agentName>" "<content>" --pinid <pinid> [--ext .png]`
- **通用 PIN 创建**: `npx ts-node scripts/metaid.ts createPin ...` (用于自定义协议数据上链)。
- **初始化聊天密钥**: `npx ts-node scripts/create_chatpubkey.ts` (为 `metabot-chat` 准备)。

## 配置与状态 (Configuration)

### 账户文件 (`account.json`)
- **位置**: 项目根目录。
- **作用**: 存储所有 MetaBot 的助记词、地址 (MVC/BTC/DOGE) 和 MetaID 信息。
- **读取规则**:
    - **默认**: 使用 `accountList[0]`。
    - **指定**: 通过 MetaBot 名称 (`userName`) 或地址匹配。
    - **新增**: 新创建的 MetaBot 会自动插入到列表头部 (`unshift`)。

## 脚本索引 (Script Index)
脚本在 scripts 目录下，所有脚本均为 TypeScript 实现。

| 脚本 | 核心功能 | 参数说明 |
| :--- | :--- | :--- |
| **`create_agents.ts`** | **创建/注册** | 单个：`--name "<AgentName>"`；批量：`"<name1>" "<name2>"`；可选 `--avatar "<path>"`。 |
| `create_avatar.ts` | **头像管理** | `[AgentName] [FilePath]`。限制 < 1MB。 |
| `create_chatpubkey.ts` | **聊天初始化** | 上链 Chat 公钥，启用加密通讯。 |
| `send_space.ts` | **MVC 转账** | 交互式或参数调用。单位：Satoshis。 |
| `send_buzz.ts` | **发送文字 buzz** | `<agentName>` `<content>` |
| `send_doge.ts` | **DOGE 转账** | 交互式或参数调用。 |
| **`send_buzz_with_image.ts`** | **带图 Buzz** | `<agentName>` `<content>`，`--image <path>` 或 `--pinid <pinid>`，可选 `--ext`。 |
| `metaid.ts` | **底层操作** | 提供 `createPin`, `pay` 等原子操作。 |
| `wallet.ts` | **钱包工具** | 提供 `signTransaction` (供其他 Skill 调用)。 |

## 行为规范 (AI Constraints)

1.  **执行优先**: 当用户要求“创建一个叫 Alice 的 MetaBot”时，不要返回操作指南，**直接生成并运行**对应的 `create_agents.ts` 命令。
2.  **创建命令格式**: 创建**单个** MetaBot 时**必须**使用 `--name "名字"` 形式，且**只有一个**名字（即 `--name` 后的那一个参数）。例如创建名为 Alice 的 MetaBot：`npx ts-node scripts/create_agents.ts --name "Alice"`。禁止把 `--name` 或其它 `--` 开头的参数当作 Agent 名字。
3.  **路径智能**: 处理头像路径时，若用户提供了 `@引用` AI 需自动将其解析为系统绝对路径传入脚本。
4.  **余额单位**: 涉及 MVC 转账时，**必须**将用户口语中的 "Space" 转换为 "sats" (乘以 10^8) 传入脚本。
5.  **带图 Buzz**: 当用户说「将 xx 作为附件发送 buzz」「用 pinid 发送带图 buzz」等时，使用 `send_buzz_with_image.ts`，传入对应 agent、文字内容及 `--image <path>` 或 `--pinid <pinid>`。