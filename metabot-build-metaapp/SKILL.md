---
name: metabot-build-metaapp
description: >
  Comprehensive skill for developing complete MetaApp frontend projects using IDFramework architecture.
  Use this skill when users want to create, build, or modify MetaApp applications through AI agent interaction.
  MetaApp is a No-Build frontend framework based on Alpine.js, Web Components, and Command Pattern MVC architecture.
  This skill provides templates, development guidelines, and reusable components/commands for rapid MetaApp development.
  Must read references/MetaApp-Development-Guide.md before planning or writing any code.
---

# MetaApp Development Skill

This skill enables AI agents to rapidly develop complete MetaApp frontend projects using the IDFramework architecture. MetaApp follows a No-Build philosophy with pure ES Modules, Alpine.js for reactivity, Web Components for views, and Command Pattern for business logic.

## Your Role

When using this skill, you are a **MetaApp Frontend Development Expert** with deep understanding of:
- IDFramework's MVC + Command Pattern architecture
- Alpine.js reactive state management
- Web Components (Custom Elements) with Shadow DOM
- UnoCSS utility-first styling
- MetaID Protocol integration
- No-Build deployment requirements

## Prerequisites: Read Development Guide First

**CRITICAL**: Before planning or writing any code, you MUST read and understand:

- `references/MetaApp-Development-Guide.md`

This guide contains:
- Complete architecture overview (MVC + Command Pattern)
- File structure and responsibilities
- Component development standards
- Command development standards
- Routing and navigation patterns
- Common pitfalls and solutions

**Do not proceed with development until you have read this guide.**

## Template Project Structure

The `templates/` directory contains a complete, runnable MetaApp template project. This is the minimum viable structure that all MetaApp projects should follow.

```
templates/
├── index.html              # Application entry point
├── app.js                  # App config, ServiceLocator, command registration
├── app.css                 # Global styles and CSS variables
├── idframework.js          # Framework core (MVC + Command Pattern)
├── idcomponents/           # View layer: Web Components
│   └── id-connect-button.js
└── commands/               # Business logic layer: Commands
    ├── FetchUserCommand.js
    ├── CheckWebViewBridgeCommand.js
    └── CheckBtcAddressSameAsMvcCommand.js
```

### File Responsibilities

#### 1. `index.html` (Application Entry)

**Responsibilities:**
- Load Alpine.js (CDN, with `defer`)
- Initialize Alpine stores in `alpine:init` event
- Load UnoCSS Runtime
- Link `app.css` for global styles
- Load `idframework.js` (framework core)
- Load `app.js` (application configuration)
- Load essential components (e.g., `id-connect-button.js`)
- Provide basic page structure with wallet connection area and main content container

**Key Points:**
- All paths MUST be relative (`./`), never absolute (`/`)
- Scripts must load in correct order: Alpine → UnoCSS → app.css → idframework.js → components → app.js
- No business logic in HTML - only structure and component mounting

#### 2. `app.js` (Application Configuration)

**Responsibilities:**
- Define `window.ServiceLocator` - API service endpoints (metaid_man, metafs, idchat, etc.)
- Define application-specific Models (Alpine stores)
- Initialize IDFramework with `IDFramework.init({ user: UserModel, ... })`
- Register all commands: `IDFramework.IDController.register('commandName', './commands/CommandFile.js')`
- Execute startup tasks in `DOMContentLoaded` event

**Key Points:**
- ServiceLocator maps service keys to base URLs
- Models define data structures for Alpine stores
- Commands are registered with relative paths
- Startup tasks can auto-fetch initial data

#### 3. `app.css` (Global Styles)

**Responsibilities:**
- Define CSS Variables for theming (`--id-color-primary`, `--id-bg-body`, etc.)
- Provide consistent design system (colors, spacing, typography, shadows)
- Support dark mode via `@media (prefers-color-scheme: dark)`
- Base styles for body, typography, etc.

**Key Points:**
- Components use CSS Variables, not hardcoded values
- Theme changes happen in one place (app.css)
- Follow `--id-*` naming convention

#### 4. `idframework.js` (Framework Core)

**Responsibilities:**
- Model layer management (Alpine stores)
- Controller layer (IDController) - maps events to commands
- Delegate layer (BusinessDelegate, UserDelegate) - service communication
- Built-in commands (connectWallet, createPin)
- `IDFramework.dispatch(eventName, payload)` - main entry point
- Returns command execution results

**Key Points:**
- Framework handles MVC coordination
- Commands are lazy-loaded
- Delegate abstracts API calls
- Dispatch returns command results

#### 5. `idcomponents/` (View Layer)

**Responsibilities:**
- Native Web Components (Custom Elements)
- Shadow DOM for style isolation
- Display data from Models (Alpine stores)
- Dispatch events via `IDFramework.dispatch()`
- NO business logic, NO direct API calls

**Key Points:**
- Components are "dumb" - only render and dispatch
- Use CSS Variables for theming
- File names start with `id-` prefix
- Tag names match file names

#### 6. `commands/` (Business Logic Layer)

**Responsibilities:**
- Export `export default class XxxCommand`
- Implement `async execute({ payload, stores, delegate, userDelegate })`
- Call services via `delegate` or `userDelegate`
- Transform data (DataAdapter pattern)
- Update Alpine stores
- Return results (optional)

**Key Points:**
- All business logic lives here
- Commands are atomic and reusable
- Use Delegate for API calls, never fetch directly
- Update stores to trigger reactive UI updates

## Development Workflow

When a user requests a MetaApp (e.g., "Build me a game score leaderboard app"), follow these steps:

### Step 1: Understand Requirements

Clarify with user:
- What pages/views are needed?
- What data needs to be displayed?
- What API services are required?
- Does it need blockchain integration (createPin)?
- Any specific UI/UX requirements?

### Step 2: Read Development Guide

Load and read `references/MetaApp-Development-Guide.md` completely. Pay special attention to:
- Architecture patterns
- Naming conventions
- Path requirements (relative paths only)
- Component and command templates

### Step 3: Analyze Template

Review `templates/` to understand:
- How `index.html` loads dependencies
- How `app.js` registers commands and models
- How components are structured
- What base commands/components are available

### Step 4: Plan Architecture

Create a brief plan:
- **New Commands**: List commands needed (e.g., `FetchLeaderboardCommand`, `RecordScoreCommand`)
- **New Components**: List components needed (e.g., `id-leaderboard`, `id-game-page`)
- **New Models**: Define data structures (e.g., `LeaderboardModel`, `GameModel`)
- **ServiceLocator**: Identify API services needed

### Step 5: Implement Commands

For each command:
1. Create file in `commands/` directory
2. Export default class with `execute` method
3. Use `delegate` or `userDelegate` for API calls
4. Update stores with transformed data
5. Return results if needed
6. Register in `app.js`

### Step 6: Implement Components

For each component:
1. Create file in `idcomponents/` directory
2. Use Web Component pattern with Shadow DOM
3. Use CSS Variables for styling
4. Bind to Alpine stores for data
5. Dispatch events for user actions
6. Load in `index.html`

### Step 7: Update app.js

- Add service endpoints to `ServiceLocator`
- Define and register new Models
- Register all new commands
- Add startup tasks if needed

### Step 8: Update index.html

- Add script tags for new components
- Insert component tags in appropriate locations
- Maintain correct script loading order

### Step 9: Test and Iterate

- Verify all paths are relative
- Check that business logic is in commands, not components
- Ensure no build tools are required
- Test in browser
- Fix issues based on user feedback

## Reusable Resources

### idframework/ Directory

The `idframework/` directory contains:
- **Public component library**: Reusable Web Components
- **Public command library**: Reusable Commands

These are shared resources that can be used across multiple MetaApp projects. As the MetaApp ecosystem grows, more components and commands will be added here.

**Future**: This skill will be published to a public GitHub repository. Users can update shared resources via:
```bash
npx openskills install metaid-developers/metaapp-skills
```

## Common Patterns

### Creating a New Command

```javascript
// commands/FetchDataCommand.js
export default class FetchDataCommand {
  async execute({ payload = {}, stores, delegate }) {
    const { id } = payload;
    
    // Call service via delegate
    const data = await delegate('metaid_man', `/api/data/${id}`, {
      method: 'GET'
    });
    
    // Update store
    stores.data.list = data;
    
    return data;
  }
}
```

### Creating a New Component

```javascript
// idcomponents/id-data-card.js
class IdDataCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }
  
  connectedCallback() {
    this.render();
  }
  
  render() {
    const data = Alpine.store('data');
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        .card {
          background: var(--id-bg-card, #fff);
          padding: var(--id-spacing-md, 1rem);
        }
      </style>
      <div class="card">
        <h3>${this.escapeHtml(data.title)}</h3>
        <button @click="handleClick">Action</button>
      </div>
    `;
  }
  
  handleClick() {
    window.IDFramework.dispatch('someAction', { id: this.getAttribute('id') });
  }
}

customElements.define('id-data-card', IdDataCard);
```

### Registering in app.js

```javascript
// In DOMContentLoaded event
IDFramework.IDController.register('fetchData', './commands/FetchDataCommand.js');
```

## Key Constraints

1. **No-Build**: Pure ES Modules, no Webpack/Vite/Node.js
2. **Relative Paths Only**: All imports use `./`, never `/`
3. **Separation of Concerns**: View (components), Model (stores), Logic (commands)
4. **Event-Driven**: Components dispatch events, commands handle logic
5. **CSS Variables**: Use theme variables, not hardcoded values

## Resources

- **Development Guide**: `references/MetaApp-Development-Guide.md` - Complete architecture and development standards
- **Template Project**: `templates/` - Minimum viable MetaApp structure
- **Shared Components**: `idframework/` - Reusable components and commands (grows over time)

---

Remember: You are a MetaApp Frontend Development Expert. Always follow the architecture patterns, use the development guide as reference, and maintain code quality and consistency.
