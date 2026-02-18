---
name: metabot-create-metaapp
description: MetaBot 专属的 MetaApp 开发与交付套件。基于 IDFramework (No-Build, MVC) 架构，支持从零构建链上前端应用、编写业务指令 (Commands)、组件开发 (Web Components) 以及最终的打包交付 (Zip)。
dependencies: python >= 3.x, alpine.js, unocss
---

# metabot-create-metaapp

赋予 **MetaBot** 开发 MetaWeb 链上原生应用 (MetaApp) 的能力。集成了架构设计、代码生成与发布打包的全流程。

## 核心工作流 (Workflows)

### 1. 应用开发 (Development)
当用户指令涉及“创建 MetaApp”、“开发前端”、“增加功能”时，**MetaBot 必须严格遵循** IDFramework 架构。

* **前置阅读 (Critical)**: 开发前**必须**读取并理解 `references/MetaApp-Development-Guide.md`。
* **脚手架**: 参照 `templates/` 目录结构初始化项目。
* **架构模式**:
    * **View**: `idcomponents/*.js` (Web Components + Alpine.js)。**禁止**在组件内写业务逻辑。
    * **Logic**: `commands/*.js` (Command Pattern)。所有 API 调用、状态变更**必须**在此完成。
    * **Core**: `idframework.js` (MVC 核心) + `app.js` (配置与注册)。

### 2. 应用打包 (Packaging)
当用户指令涉及“打包应用”、“生成 Zip”、“准备发布”时，**必须直接执行**以下脚本。

* **脚本**: `python3 scripts/package_metaapp.py <project_path> [options]`
* **功能**: 自动校验项目结构 -> 过滤开发文件 (.git, node_modules) -> 生成发布包。
* **输出**: `dist-<timestamp>.zip` (位于项目根目录)。
* **校验规则**: 目标目录必须包含 `index.html`, `app.js`, `app.css`, `idframework.js` 及 `idcomponents/`, `commands/` 目录，否则脚本会报错。

## 文件结构与职责 (Architecture)

MetaBot 在编写代码时需严格遵守以下文件职责：

| 文件/目录 | 核心职责 | AI 编写规范 |
| :--- | :--- | :--- |
| **`index.html`** | 入口 | 加载 Alpine/UnoCSS/App.js；**禁止**写业务 Script。 |
| **`app.js`** | 配置 | 注册 ServiceLocator，注册 Models，**注册 Commands**。 |
| **`commands/`** | **业务逻辑** | `export default class XxxCommand`。调用 Delegate，更新 Store。 |
| **`idcomponents/`** | **视图组件** | Shadow DOM 隔离。只负责渲染 Store 数据和 Dispatch 事件。 |
| **`app.css`** | 样式 | 定义 CSS 变量 (Theming)。支持深色模式。 |
| **`idframework.js`** | 框架核心 | **不要修改此文件**。 |

## 代码生成规范 (Coding Constraints)

1.  **No-Build 哲学**: 使用原生 ES Modules。**严禁**引入 Webpack/Vite/Babel 或 `require()` 语法。
2.  **路径引用**: 所有 import **必须**使用相对路径 (如 `./commands/Auth.js`)，**严禁**使用绝对路径 (`/src/...`)。
3.  **Command 模式**:
    * 组件**不直接**调 API，必须 `IDFramework.dispatch('cmdName', payload)`。
    * Command **不直接**操作 DOM，必须修改 Alpine Store (`stores.user.name = ...`) 触发响应式更新。
4.  **样式隔离**: 组件内使用 Shadow DOM 和 CSS 变量 (`var(--id-color-bg)`)，确保样式不污染。

## 常用开发模板

### Command 模板
```javascript
export default class FetchDataCommand {
  async execute({ payload, stores, delegate }) {
    // 1. 调用服务 (通过 Delegate)
    const data = await delegate('service_name', `/api/resource/${payload.id}`);
    // 2. 更新状态 (Alpine Store)
    stores.appData.currentList = data;
  }
}
```

### Component 模板
```javascript
class IdCard extends HTMLElement {
  constructor() { super(); this.attachShadow({ mode: 'open' }); }
  connectedCallback() {
    const store = Alpine.store('appData'); // 绑定数据
    this.shadowRoot.innerHTML = `<div>${store.currentList.name}</div>`;
  }
}
customElements.define('id-card', IdCard);
```

## 脚本索引 (Script Index)
- scripts/package_metaapp.py: 打包工具。用法: python3 scripts/package_metaapp.py ./my-app
- templates/: 标准项目模板 (Reference ONLY)。

**注意: ** MetaApp 是运行在 MetaWeb 上的去中心化应用，代码质量直接决定用户资产安全。MetaBot 必须确保逻辑严密，并优先使用 commands/ 封装业务。