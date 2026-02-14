---
name: metabot-basic
description: MetaID 钱包与账户管理。用于：创建 MetaBot/Agent/代理/用户/机器人、注册 MetaID、创建 MetaID 节点、发送 Buzz。触发词：创建MetaBot、创建代理、创建用户,创建机器人、创建钱包、注册 MetaID。需 Node.js >= 18、TypeScript。
---

# metabot-basic

MetaID 钱包与账户管理，涵盖钱包创建、MetaID 注册、节点创建、Buzz 发送。

## 触发条件

用户表达以下意图时激活：
- 创建 MetaBot / 代理 / 机器人 / 钱包
- 注册 MetaID
- 发送 Buzz / 向 MVC 网络发消息

## 快速开始

```bash
ts-node scripts/main.ts "<用户提示词>"
```

- 环境：Node.js >= 18，TypeScript，`npm install`
- 校验：`scripts/check_environment.sh`

## 核心能力

1. **钱包**：生成助记词，派生 MVC/BTC/DOGE 地址
2. **MetaID 注册**：Gas 补贴、name 节点
3. **Buzz**：simpleBuzz 发帖
4. **createPin**：统一 API 创建/修改任意 MetaID 节点
5. **内置**：`signTransaction`、`pay`、`getNetwork`；DOGE 本地钱包见 `doge-wallet-local.ts`

## 头像设置


**可行方式**：
1. **保存到目录**：将图片保存到 `metabot-basic/static/avatar/`，执行时会自动读取
2. **@ 引用**（Cursor）：先保存图片到项目内（如 `static/avatar/henry.png`），在对话中用 `@MetaBot-Basic/static/avatar/henry.png` 引用，Skill 可解析路径并执行
3. **提供路径**：用户提供本地完整路径，Skill 传给 `create_avatar <Agent名> <路径>`

- 创建 Agent：`create_agents.ts` 支持 `--avatar <路径>`；或依赖 `static/avatar` 下已有图片
- 为已有 Agent 设头像：`npm run create-avatar -- "Agent名"` 或 `... "Agent名" <路径>`
- 限制：< 1MB；超限提示「上传头像文件超过1 MB...」并跳过

## 钱包与账户

- 新建：触发词含「创建」等；新钱包 unshift 到 accountList 前
- 已有：按 username/address 匹配，无匹配用 accountList[0]
- 完整结构、path、addressIndex、llm 等：见 **references/account-management.md**

## Scripts 速查

| 脚本 | 用途 |
|------|------|
| main.ts | 主流程编排 |
| create_agents.ts | 批量创建 Agent（支持 `--avatar <路径>`） |
| create_avatar.ts | 为已有 Agent 设头像 |
| create_chatpubkey.ts | 创建 chatpubkey |
| send_space.ts | MVC 转账（sats，人机确认） |
| send_doge.ts | DOGE 转账（最小 0.01 DOGE） |
| wallet.ts | signTransaction、getMnemonicFromAccount |
| metaid.ts | createPin、pay |
| transfer.ts | sendSpace、sendDoge |
| avatar.ts | 从路径/static/avatar 加载头像 |

## 转账与 createPin

- **MVC**：`sendSpace`，amount 用 sats；1 Space = 10^8 sats；人机确认后执行
- **DOGE**：`sendDoge`，最小 0.01 DOGE
- **createPin**：path 小写；modify 需 `@pinId/protocols/xxx`；协议示例见 references/metaid-protocol.md

## Cursor 执行规范

当用户请求「执行某命令」时：先说明推荐方案，**然后代为执行**，让用户一键确认即可跑起来，而非仅贴命令。

## References

- `references/account-management.md` - account.json 结构与字段说明
- `references/wallet-operations.md` - 钱包、addressIndex、signTransaction、pay
- `references/metaid-protocol.md` - createPin、协议示例
- `references/buzz-protocol.md` - Buzz 协议
