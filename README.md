# MetaID Skills（Claude Code 使用说明）
##
> **📖 重要提示**：**在使用 MetaID Skills 前，请先仔细阅读并理解本 README.md 的全部内容**，以确保正确配置和使用。

本目录包含可在 **Claude Code**（Cursor / Claude IDE）中使用的 MetaApp 开发与打包 Skills。通过 OpenSkills 安装后，可在对话中使用 `/skills` 查看并启用这些能力。

---

## 在 Cursor/Claude 中安装并使用 MetaID SKILL（完整流程）

以下说明帮助你在 Cursor 或 Claude IDE 中完成环境准备、安装与首次使用 MetaID SKILL。

### 1. 安装 Node.js 环境

运行 MetaID SKILL 前，请确保本机已安装 **Node.js**。

- **下载地址**：<https://nodejs.org/>
- **版本要求**：需 **Node.js 20.x 及以上**（建议使用 LTS 版本）。

**安装步骤（以 Windows / macOS 为例）：**

1. 打开 [Node.js 官网](https://nodejs.org/)，选择 **LTS（长期支持版）** 下载安装包。
2. **Windows**：运行下载的 `.msi` 安装程序，按向导下一步完成安装；勾选 “Add to PATH” 以便在终端使用 `node`、`npm`。
3. **macOS**：运行 `.pkg` 安装程序完成安装；或使用 [Homebrew](https://brew.sh/) 执行：`brew install node`。
4. 安装完成后，打开终端（或 Cursor 内置终端），执行：
   ```bash
   node -v
   npm -v
   ```
   若分别输出版本号（如 `v20.x.x`、`10.x.x`），说明 Node 环境已就绪。

### 2. 安装 Cursor（以 Cursor 为例）

- **下载地址**：<https://cursor.com/cn/download>
- 下载并安装 Cursor 后，按需完成登录、注册与付费开通；具体操作可搜索「Cursor 登录 / 注册 / 付费」等视频教程，此处不展开。

### 3. 安装 MetaID SKILL

上述环境与 Cursor 准备就绪后，请按照本文档下一节 **「如何在 Claude Code、Cursor 中引入 MetaID Skills」** 的说明，使用 OpenSkills 安装 MetaID SKILL。

### 4. 验证 MetaID SKILL 是否可用

安装成功后，可在 Cursor 对话中直接使用自然语言与 SKILL 交互，例如：

- 输入：**「帮我创建一个名字叫 XXX 的 MetaBot」**

首次执行时，会拉取并安装项目所需依赖；若出现安装或执行确认提示，在对话框中点击 **确认 / 接受** 即可。若 Agent 创建成功，即表示 MetaID SKILL 已正常安装并可继续使用其他能力（如群聊、发送 Buzz 等）。

---

## 如何在Claude Code，Cursor中引入MetaID Skills

1. 在 IDE 终端中执行：
   ```bash
   npx openskills install metaid-developers/metaid-skills
   ```
2. 启动 Claude，在对话框中输入：
   ```
   /skills
   ```
   即可看到刚拉取的 MetaID Skills，并可按需启用。

## 如何在Codex等其他Agent平台中引入MetaID Skills

1. 在 IDE 终端中执行：
   ```bash
   npx openskills install metaid-developers/metaid-skills
   ```
   
2. **⚠️ 重要提示**：拉取MetaID Skills仓库成功后会在项目目录中看到 **`.claude/skills`** 这样的文件目录结构。**在非Claude终端（如Cursor、Codex等）中使用MetaID Skills时，需要修改文件名称**：把 **`.claude/skills`** 改成 **`.codex/skills`** 即可，其他不变。

3. 在 Agent 对话中让助手列举当前可用的 skills，例如：
   - 「列举一下当前可用的 skills」
   - 「当前项目有哪些可用的 skills？」

## 如何更新 MetaID Skills

需要获取最新提交时，在终端执行：

```bash
npx openskills update
```

## 当前可用的 Skills

- **metaapp-develop**：基于 IDFramework 架构开发完整 MetaApp 前端项目（模板、组件、命令、开发指南）。
- **metaapp-builder**：将已完成的 MetaApp 前端项目打包为可发布的 zip 压缩包。
- **metabot-basic**: 用于创建 MetaBot（MetaID Agent）,集成钱包创建，生成 MetaID 账户,设置头像，发送交易等功能(持续更新中)。
- **metabot-chat**: 用于 MetaBot 群聊功能(持续更新中)。
详细说明与触发方式见各 Skill 目录下的 `SKILL.md`。
