# Cursor Glass → pi-desktop Migration Roadmap

## What Exists vs What's Missing

pi-desktop already has the skeleton of a Cursor agent window:
- Electron + React shell with glass CSS theme (light only)
- Sidebar (workspaces, sessions), Transcript (markdown, tools, thinking), InputBar (model picker, thinking level, queue)
- Session lifecycle (create, fork, clone, rename, delete)
- Streaming responses with steer/followUp modes
- Retry logic, error banners
- IPC bridge (main ↔ renderer)

The reference implementation lives at `~/Desktop/cursor-decompile/`. The Glass
bundle (`workbench.glass.main.js`, 51MB) contains every feature below, fully
implemented. You can grep it for patterns, protocols, and data structures.

---

## Phase 1: Polish the Glass Shell

### 1.1 Titlebar Integration
- Make the topbar a proper traffic-light-aware titlebar
- On macOS: offset sidebar content to clear traffic lights (~34px top pad already there)
- Add window controls when frameless: close, minimize, maximize
- Commands to map: `glass.closeWindow`, `glass.maximizeWindow`, `glass.minimizeWindow`

### 1.2 Full CSS Token System
- Replace pi-desktop's 30 simplified CSS variables with the ~130 Cursor tokens
- See Appendix A for the complete list extracted from `workbench.glass.main.js`
- Key additions: syntax highlighting tokens, terminal tokens, more granular bg/text levels

---

## Phase 2: Agent Modes

### 2.1 Mode Selector
- Add mode picker alongside model/thinking controls in the InputBar
- Modes from Cursor: `normal`, `agent`, `yolo` (auto-run), `manual` (smart mode)
- Reference: `composerModesService.js`, `composerModeUtils.js`
- The mode affects: tool auto-approval, shell command execution, file edit permissions

### 2.2 Mode-Specific Behaviors
- **Normal**: Agent asks before file edits and shell commands
- **Agent**: Auto-executes safe operations, prompts for risky ones
- **Yolo/Full Auto**: Auto-executes everything
- **Smart/Manual**: Human-in-the-loop for every tool call
- Reference: `composerEffectiveAllowlistService.js`, permission system

### 2.3 Mode Storage
- Persist per-agent mode selection
- Mode can change mid-conversation (tool call handler: `switchMode`)
- Reference: `composerModesServiceTypes.js`

---

## Phase 3: Tab System

### 3.1 Tab Bar
- Add horizontal tab bar above the main pane
- Tab types: agent chat, browser, diff/changes, canvas
- Each tab gets a title, icon, close button
- Commands: `glass.newTab`, `glass.nextTab`, `glass.previousTab`, `glass.goToTab1-9`

### 3.2 Agent Tabs
- Support multiple concurrent agent conversations per workspace
- Add "New Agent" button/keyboard shortcut (⌘N)
- Tab shows agent name or truncated first message
- Context key: `glass.newAgent`, `glass.newAgentFromKeyboard`

### 3.3 Browser Tabs
- Embedded webview for web browsing
- URL bar, back/forward, reload
- Dev tools injection (`glass.toggleDesignMode`)
- Commands: `glass.newBrowser`, `glass.activateBrowserTab`,
  `glass.focusBrowserLocationBar`, `glass.hardReloadBrowserTab`

### 3.4 Diff/Changes Tab
- Shows file changes made by the agent
- Side-by-side or unified diff view
- Accept/reject individual changes
- Commands: `glass.openChangesTab`, `glass.refreshDiffTab`,
  `glass.diffTabNextFile`, `glass.diffTabPrevFile`

### 3.5 Tab State
- Persist open tabs per agent
- Tab switch restores scroll position
- Reference: `composerViews.js` tab management

---

## Phase 4: Tool Execution UI

### 4.1 Tool Approval Flow
- When agent wants to run a shell command, show approval dialog
- Show command, working directory, risk level
- Approve / Deny / Approve & Remember
- Reference: `toolCallHandlers/shell/shellToolCallHandler.js`,
  `composerDecisionsService.js`

### 4.2 File Edit Preview
- Show diff before applying file edits
- Inline diff with accept/reject per hunk
- Reference: `toolCallHandlers/edit/editToolCallHandler.js`,
  `composerCodeBlockDiffStorageService.js`

### 4.3 Tool Result Display
- Collapsible tool call blocks with execution time
- Error state with retry option
- Already partially implemented in `MessageBlocks.tsx`

### 4.4 Pending Approval Registry
- Track pending approvals (shell, file operations)
- Show pending count as badge
- Reference: `pendingApprovalRegistry.js`, `toolCallHumanReviewService.js`

---

## Phase 5: Context & Mentions

### 5.1 Plus/Context Menu
- Button in InputBar to add context
- Options: files, folders, symbols, web search, images
- Reference: Cursor "unified context menu" — `ComposerUnifiedContextMenu.js`

### 5.2 @Mention Autocomplete
- Type @ in input to trigger mention search
- Sources: files, symbols, git history, web
- Ranking system
- Reference: `mentionsCapabilityService.js`, `mentionsQuery.js`, `mentionsRanking.js`

### 5.3 Slash Commands
- Type / to see agent commands
- Commands: `/edit`, `/search`, `/task`, `/plan`, etc.
- Reference: `slashMenu/slashMenuData.js`

### 5.4 File Attachments
- Drag & drop files into composer
- Paste images from clipboard
- Preview thumbnails
- Reference: `composerBlobStore.js`

---

## Phase 6: Agent Enhancements

### 6.1 Checkpointing / Branching
- Save conversation state at each user message
- Allow branching from any point (already have `fork`)
- Visual branch tree
- Reference: `composerCheckpointService.js`, `composerCheckpointStorageService.js`

### 6.2 Conversation Recovery
- Auto-save drafts during composition
- Recover interrupted conversations
- Reference: `composerConversationRecovery.js`, `composerInitialHumanRecovery.js`

### 6.3 Agent Pinning & Archiving
- Pin important agents to top of sidebar
- Archive old agents (don't delete, just hide)
- Reference: `pinnedAgentsStorage.js`, `glass.toggleAgentPin`,
  `glass.archiveActiveAgent`

### 6.4 Agent Metadata
- Show model used, token count, duration
- Agent status (idle, running, error)
- Reference: `agentStatusMapper.js`

### 6.5 Subagents
- Agent can spawn subagents for parallel work
- Subagent progress in parent conversation
- Subagent results folded into parent
- Reference: `taskToolCallHandler.js`, `subagentComposerService.js`,
  `subagentExecutor.js`

---

## Phase 7: Command Palette & Keyboard

### 7.1 Command Palette (⌘K)
- Searchable list of all commands
- Glass commands list (see Appendix B)
- Reference: `glass.openActionsPalette`

### 7.2 File Palette (⌘P)
- Quick file open
- Recently mentioned files
- Reference: `glass.openFilePrioritizedPalette`

### 7.3 Keyboard Shortcuts
- Map all Glass commands to keyboard shortcuts (see Appendix B)
- System-standard: ⌘W close, ⌘N new, ⌘, settings
- Cursor-specific: ⌘⇧] next tab, ⌘⇧[ prev tab, ⌘⏎ send
- Reference: Glass command constants in workbench bundle

---

## Phase 8: Advanced Features

### 8.1 Voice Mode
- Dictate messages
- Push-to-talk with `glass.holdToTalk`
- Reference: `glass.dictate`, `glass.holdToTalk`

### 8.2 Deeplinks
- Share agent conversation via URL
- `cursor://...` protocol handler
- Reference: `glass.handleDeeplink`, `glass.copyAgentDeeplink`

### 8.3 Background/Cloud Agents
- Run agent on cloud VM
- FSD (Full Self-Development) slash command
- Reference: `cloudAgentRepositoryService.js`, `cloudAgentStream.js`,
  `glass.agentPanel.fsd*` commands

### 8.4 Settings Panel
- Glass-specific settings (theme, model defaults, keybindings)
- Searchable settings
- Reference: `glass.settings`, `glass.openSettingsSearchPalette`

### 8.5 Workspace Search
- Full-text search across workspace
- Navigate results
- Reference: `glass.openWorkspaceSearch`, `glass.nextWorkspaceSearchResult`,
  `glass.previousWorkspaceSearchResult`

---

## Phase 9: Deferred (Low Priority)

### 9.1 Dark Mode
- Add dark CSS variables to `glass.css` using the Cursor token set (see Appendix A)
- Detect system preference: `prefers-color-scheme`
- The reference bundle has `glass.theme.settingsId`, `glass.theme.darkSettingsId`,
  `glass.theme.lightSettingsId`, `glass.theme.detectColorScheme`

### 9.2 GitHub Integration
- PR status, CI status, review status
- Create PR from agent's changes, view PR diff
- Agent code review with inline comments
- Reference: `PullRequestRepositoryService.js`, `GithubService.js`

### 9.3 MCP Integration
- External tool servers via Model Context Protocol
- Tool discovery and execution
- Reference: `@modelcontextprotocol` in node_modules

---

## Appendix A: CSS Token System

Extracted from `workbench.glass.main.js`. Replace pi-desktop's simplified
variables with this full set. Group into light and dark variants.

### Background
```css
--cursor-bg
--cursor-bg-primary / --cursor-bg-secondary
--cursor-bg-card / --cursor-bg-chrome
--cursor-bg-editor / --cursor-bg-elevated / --cursor-bg-input
--cursor-bg-hover / --cursor-bg-active / --cursor-bg-focused
--cursor-bg-accent / --cursor-bg-accent-hover
--cursor-bg-accent-secondary / --cursor-bg-accent-tertiary
--cursor-bg-accent-quaternary / --cursor-bg-quinary
--cursor-bg-red-primary / --cursor-bg-red-secondary
--cursor-bg-blue-primary / --cursor-bg-blue-secondary
--cursor-bg-green-primary / --cursor-bg-green-secondary
--cursor-bg-cyan-primary / --cursor-bg-cyan-secondary
--cursor-bg-magenta-primary / --cursor-bg-magenta-secondary
--cursor-bg-orange-primary / --cursor-bg-orange-secondary
--cursor-bg-purple-primary / --cursor-bg-purple-secondary / --cursor-bg-purple-tertiary
--cursor-bg-danger-tertiary
--cursor-bg-diff-inserted / --cursor-bg-diff-removed / --cursor-bg-diff-selection
```

### Text
```css
--cursor-text / --cursor-text-primary / --cursor-text-secondary
--cursor-text-tertiary / --cursor-text-quaternary
--cursor-text-accent / --cursor-text-active / --cursor-text-focused
--cursor-text-invert / --cursor-text-on-accent
--cursor-text-link / --cursor-text-link-active
--cursor-text-error / --cursor-text-warning-primary
--cursor-text-added / --cursor-text-modified
--cursor-text-removed / --cursor-text-untracked
--cursor-text-red-primary / --cursor-text-red-secondary
--cursor-text-blue-primary / --cursor-text-blue-secondary
--cursor-text-green-primary / --cursor-text-green-secondary
--cursor-text-cyan-primary / --cursor-text-cyan-secondary
--cursor-text-magenta-primary / --cursor-text-magenta-secondary
--cursor-text-orange / --cursor-text-orange-primary / --cursor-text-orange-secondary
--cursor-text-purple-primary / --cursor-text-purple-secondary
--cursor-text-yellow-primary / --cursor-text-yellow-secondary
--cursor-text-code-block-background
```

### Icon
```css
--cursor-icon-primary / --cursor-icon-secondary
--cursor-icon-red-primary / --cursor-icon-red-secondary
--cursor-icon-blue-primary / --cursor-icon-blue-secondary
--cursor-icon-green-primary / --cursor-icon-green-secondary
--cursor-icon-cyan-primary / --cursor-icon-cyan-secondary
--cursor-icon-magenta-primary / --cursor-icon-magenta-secondary
--cursor-icon-orange-primary / --cursor-icon-orange-secondary
--cursor-icon-purple-primary / --cursor-icon-purple-secondary
```

### Stroke & Border
```css
--cursor-stroke-primary / --cursor-stroke-secondary
--cursor-stroke-red-primary / --cursor-stroke-red-secondary
--cursor-stroke-blue-primary / --cursor-stroke-blue-secondary
--cursor-stroke-green-primary / --cursor-stroke-green-secondary
--cursor-stroke-cyan-primary / --cursor-stroke-cyan-secondary
--cursor-stroke-magenta-primary / --cursor-stroke-magenta-secondary
--cursor-stroke-orange-primary / --cursor-stroke-orange-secondary
--cursor-stroke-purple-primary / --cursor-stroke-purple-secondary
--cursor-titlebar-active-foreground / --cursor-titlebar-inactive-foreground
--cursor-toolbar-hover-background
```

### Syntax Highlighting
```css
--cursor-syntax-foreground / --cursor-syntax-comment
--cursor-syntax-keyword / --cursor-syntax-string / --cursor-syntax-number
--cursor-syntax-function / --cursor-syntax-variable / --cursor-syntax-type
--cursor-syntax-property / --cursor-syntax-parameter
--cursor-syntax-class / --cursor-syntax-constant
--cursor-syntax-punctuation / --cursor-syntax-tag / --cursor-syntax-link
--cursor-syntax-string-expression / --cursor-syntax-language-variable
--cursor-syntax-constant-variable
```

### Terminal
```css
--cursor-terminal-background / --cursor-terminal-foreground
--cursor-terminal-selection-background
--cursor-terminal-ansi-black / --cursor-terminal-ansi-red
--cursor-terminal-ansi-green / --cursor-terminal-ansi-yellow
--cursor-terminal-ansi-blue / --cursor-terminal-ansi-magenta
--cursor-terminal-ansi-cyan / --cursor-terminal-ansi-white
--cursor-terminal-ansi-bright-black / --cursor-terminal-ansi-bright-red
--cursor-terminal-ansi-bright-green / --cursor-terminal-ansi-bright-yellow
--cursor-terminal-ansi-bright-blue / --cursor-terminal-ansi-bright-magenta
--cursor-terminal-ansi-bright-cyan / --cursor-terminal-ansi-bright-white
```

### Semantic
```css
--cursor-accent / --cursor-base / --cursor-warn / --cursor-yellow
--cursor-added / --cursor-untracked
--cursor-action-label / --cursor-action-icon-primary-rgb
--cursor-warning-foreground
```

---

## Appendix B: Glass Commands

Complete command set from `workbench.glass.main.js`. Map these to
your IPC bridge and keyboard shortcut system.

### Window
| Command | Suggested Shortcut | Description |
|---------|-------------------|-------------|
| `glass.closeWindow` | ⌘W | Close window |
| `glass.maximizeWindow` | — | Maximize |
| `glass.minimizeWindow` | ⌘M | Minimize |
| `glass.unmaximizeWindow` | — | Restore from maximize |

### Tabs
| Command | Suggested Shortcut | Description |
|---------|-------------------|-------------|
| `glass.newTab` | ⌘T | New tab (context-dependent) |
| `glass.newAgent` | ⌘N | New agent chat |
| `glass.newAgentFromKeyboard` | ⌘⇧N | New agent (from keyboard) |
| `glass.newBrowser` | — | New browser tab |
| `glass.nextTab` | ⌘⇧] | Next tab |
| `glass.previousTab` | ⌘⇧[ | Previous tab |
| `glass.goToTab1` … `glass.goToTab9` | ⌘1 … ⌘9 | Go to tab |
| `glass.closeBrowserTab` | — | Close browser tab |
| `glass.openEditorPanelNewTabMenu` | — | New tab menu |

### Agent
| Command | Suggested Shortcut | Description |
|---------|-------------------|-------------|
| `glass.nextAgent` | ⌥⌘↓ | Next agent |
| `glass.previousAgent` | ⌥⌘↑ | Previous agent |
| `glass.openRecentAgents` | — | Recent agents menu |
| `glass.toggleAgentPin` | — | Pin/unpin agent |
| `glass.archiveActiveAgent` | — | Archive agent |
| `glass.abortAgentAndRestoreQuery` | — | Abort + restore |
| `glass.changeToMultitask` | — | Switch multitask mode |
| `glass.openAgentById` | — | Open agent by ID |
| `glass.copyAgentDeeplink` | — | Copy share link |

### Navigation & Focus
| Command | Suggested Shortcut | Description |
|---------|-------------------|-------------|
| `glass.focusInput` | ⌘L | Focus chat input |
| `glass.focusBrowserLocationBar` | ⌘L | Focus browser URL |
| `glass.togglePanel` | ⌘J | Toggle bottom panel |
| `glass.toggleSidebar` | ⌘B | Toggle sidebar |
| `glass.toggleSidebarFromKeyboard` | ⌘⇧B | Sidebar from keyboard |
| `glass.toggleTerminal` | ⌘` | Toggle terminal |
| `glass.openActionsPalette` | ⌘K | Command palette |
| `glass.openFilePrioritizedPalette` | ⌘P | File palette |
| `glass.openSettingsSearchPalette` | ⌘, | Settings search |
| `glass.toggleDesignMode` | — | Browser design mode |

### Chat
| Command | Suggested Shortcut | Description |
|---------|-------------------|-------------|
| `glass.openModelPicker` | — | Open model picker |
| `glass.cycleModelParameter` | — | Cycle model parameter |
| `glass.importChat` | — | Import chat |
| `glass.exportChat` | — | Export chat |
| `glass.openActiveAgentInNewWindow` | — | Pop out agent |

### Diff
| Command | Suggested Shortcut | Description |
|---------|-------------------|-------------|
| `glass.openChangesTab` | — | Open changes/diff |
| `glass.refreshDiffTab` | — | Refresh diff |
| `glass.diffTabNextFile` | — | Next diff file |
| `glass.diffTabPrevFile` | — | Previous diff file |
| `glass.diffTabScrollDown` | — | Scroll diff down |
| `glass.diffTabScrollUp` | — | Scroll diff up |

### Context Keys (for conditional UI)
| Key | Meaning |
|-----|---------|
| `cursor.glassEnableOpenAgentInWindow` | Can pop out agent |
| `cursor.glassAutomationsUiAvailable` | UI automation tools active |
| `cursor.hasOpenGlassWindow` | At least one Glass window open |

---

## Appendix C: Reference File Map

Key files in the decompiled Cursor for feature research:

```
~/Desktop/cursor-decompile/out/vs/workbench/
├── workbench.glass.main.js              ★ Glass agent bundle (51MB)
├── workbench.desktop.main.js            ★ Full IDE + Composer (1.6MB)
└── workbench.anysphere-ui-automations.js

Internal module paths (bundled, grep the above files):
├── services/agent/browser/
│   ├── agentClientService.js            ★ Core LLM streaming
│   ├── agentExecProviderService.js       Agent execution routing
│   ├── agentPrewarmService.js            Model prewarming
│   ├── agentProviderService.js           Provider registry
│   ├── agentResponseAdapter.js           Response normalization
│   ├── agentTraceContext.js              Distributed tracing
│   ├── agentTranslationUtils.js          Prompt construction
│   ├── backgroundWorkRegistry.js         Background work queue
│   ├── bidiStreamHandlerRegistry.js      Bidirectional streams
│   ├── checkoutProviderService.js        Git checkout
│   ├── cloudAgentStorageService.js       Cloud persistence
│   ├── cloudSubagentRunner.js            Cloud subagent orchestration
│   ├── connectionTokenProviderService.js Auth tokens
│   ├── contextSetup.js                   Context assembly
│   ├── conversationActionManager.js      Action dispatch
│   ├── explorerOrchestratorService.js    Code exploration
│   ├── gitDiffExecutor.js                Git diff tool
│   ├── localAgentProviderConfig.js       Local model config
│   ├── mockAgentStreamController.js      Mock streaming (tests)
│   ├── populateConversationFromState.js  State → conversation
│   ├── pushRequestContextService.js      Push to agent
│   ├── readExecutor.js                   File read tool
│   ├── shellExecutor.js                  Shell execution
│   ├── subagentComposerService.js        Subagent bridge
│   ├── writeExecutor.js                  File write tool
│   └── toolCallHandlers/
│       ├── askQuestion/                  Question dialogs
│       ├── createPlan/                   Plan creation
│       ├── edit/                         File editing
│       ├── generateImage/                Image generation
│       ├── mcpAuth/                      MCP auth flows
│       ├── shell/                        Shell + approval
│       ├── switchMode/                   Mode switching
│       ├── task/                         Subagent spawning
│       ├── todo/                         Todo management
│       ├── webFetch/                     Web fetching
│       └── webSearch/                    Web search
├── services/agentData/
│   ├── agentRepositoryService.js         Agent CRUD
│   ├── agentProjectService.js            Project association
│   ├── glassActiveAgentService.js        ★ Active agent management
│   ├── cloudAgentRepositoryService.js    Cloud agent API
│   ├── cloudAgentStream.js               Cloud streaming
│   ├── GithubService.js                  ★ GitHub API
│   ├── PullRequestRepositoryService.js   ★ PR operations
│   ├── mentionsCapabilityService.js      @mentions
│   ├── mentionsQuery.js                  Mention search
│   ├── mentionsRanking.js                Mention ranking
│   └── pinnedAgentsStorage.js            Pin state
└── contrib/composer/browser/
    ├── composer.js                       ★ Main view controller
    ├── composerChatService.js            ★ Message bus
    ├── composerDataService.js            ★ Central data store
    ├── composerData.js                   Data schemas
    ├── composerEventService.js           Event bus
    ├── composerModesService.js           Agent modes
    ├── composerCapabilities.js           Capability registry
    ├── composerViews.js                  Tab management
    ├── composerCheckpointService.js      Branching
    ├── composerMessageStorageService.js  Message persistence
    ├── composerStorageService.js         State persistence
    ├── composerBlobStore.js              Attachments
    ├── composerCodeBlockService.js       Diff tracking
    ├── composerDecisionsService.js       Agent decisions
    ├── composerEffectiveAllowlistService.js Permissions
    ├── composerTerminalService.js        Terminal integration
    ├── composerWakelockManager.js        Power management
    ├── claudeCodeComposerBridge.js       Claude Code bridge
    ├── browserAutomationService.js       Browser agent
    └── components/
        ├── composerMessagesHelpers.js    Message rendering
        ├── composerMessagesTypes.js      Message types
        ├── ComposerCompactMenu.js        Action menu
        ├── ComposerUnifiedContextMenu.js Context menu
        ├── ComposerUnifiedDropdown.js    Dropdown
        ├── BrowserEditorContent.js       Browser view
        ├── browserNavigation.js          Browser nav
        ├── OmniboxDropdown.js            Command palette
        ├── slashMenu/slashMenuData.js    Slash commands
        └── cssInspector/                 CSS inspector
```

---

## Appendix D: Data Flow (pi-desktop → Glass)

Current pi-desktop flow:
```
User Input → InputBar → window.pi.sendPrompt() → main/session-runtime.ts
  → pi agent packages → streaming response → SessionEvent → Transcript
```

Target Glass flow:
```
User Input → Composer → agentClientService.streamChat()
  → LLM (streaming + tool calls) → agentResponseAdapter
  → toolCallHandlers dispatch → composerDataService.updateConversation()
  → React re-render (messages, diffs, tool results)
```

Key differences to address:
- pi uses pi-agent-core for LLM; Cursor uses gRPC to aiserver
- pi sessions are file-based; Cursor uses indexed services
- pi has steer/followUp; Cursor has agent modes + tool approval
- pi has one agent per workspace; Cursor has multiple tabs
