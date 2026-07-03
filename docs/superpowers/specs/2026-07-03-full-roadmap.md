# pi-desktop: Full Roadmap Spec

Master spec for all remaining work to make pi-desktop a faithful, functional
replica of Cursor's "Agents Window", backed by the pi coding agent.

Each numbered sub-project below is independently shippable and gets its own
`writing-plans` pass (task-by-task plan) when picked up. This document is the
scope+design layer above those plans.

## Current state (done)

- **Core shell** (`2026-07-03-core-shell-design.md`): Electron + React app,
  tray toggle, workspace registry, session sidebar grouped by workspace,
  chat transcript with streaming, model picker, `RpcClient` integration.
- **Cursor light theme**: sidebar sections, session selection, header
  breadcrumb, readable transcript (tables/code/bubbles), Cursor-style composer.
- Fixes landed: Electron 41 (undici/Node 22), CJS preload, permissive dev CSP,
  `window.pi` guard, message-dedup (message_end as source of truth).

## Guiding principles

1. **Cursor is the design source of truth.** Extract real values from
   `/Applications/Cursor.app/.../workbench.glass.main.css` and the running
   window; reimplement cleanly (no proprietary code copied — EULA §1.3).
2. **pi is the only backend.** No custom LLM calls; everything routes through
   `RpcClient` / `SessionManager` / pi's session files.
3. **Each panel is its own unit** with a clear IPC surface, so sub-projects
   don't entangle.
4. **YAGNI.** Cursor has features tied to its cloud/editor that make no sense
   here (see Non-goals). Build the agent-dashboard subset.

---

## Sub-project 1 — Agent controls & session lifecycle

**Goal:** Make an open agent fully operable, matching Cursor's per-message and
per-session controls.

**Scope:**
- **Abort / stop** a running agent (`RpcClient.abort()`); Send button becomes
  Stop while streaming.
- **Steer & follow-up** while streaming (`steer()` / `followUp()`), matching
  pi's `streamingBehavior`. UI: sending while streaming offers steer vs queue.
- **Thinking-level picker** next to the model picker (`setThinkingLevel`,
  `cycleThinkingLevel`; levels off→xhigh).
- **Message action row** under each message (Cursor: 👍/👎, branch, copy).
  Copy (`getLastAssistantText` or block text), **fork** from a user message
  (`fork(entryId)` → new session), branch/tree navigation deferred to 1b.
- **Session management:** rename (`setSessionName`), delete (remove `.jsonl`
  via a main-process handler using the `trash` CLI when available), new/clone
  (`clone()`).
- **Queue indicator** (`queue_update` events → show pending steer/follow-up).
- **Error & retry UI:** surface `{success:false}`, process crash, and
  `auto_retry_*` events as an inline banner with retry; auto-restart a dead
  `RpcClient`.

**pi integration:** `abort`, `steer`, `follow_up`, `set_thinking_level`,
`fork`, `clone`, `set_session_name`, `get_fork_messages`, events
`queue_update`/`auto_retry_start|end`.

**Depends on:** core shell. **Unlocks:** everything (this is the highest-value
next step — the app is currently send-only).

**Tests:** view-model for message action availability; error-banner state
reducer.

---

## Sub-project 2 — Git changes panel

**Goal:** Cursor's right-panel "Changes +N -N" + "Commit & Push" for the
active session's working directory.

**Scope:**
- Right panel listing changed files with +/- stat and per-file diff view.
- Bottom-bar chip "Changes +N −N" (matches Cursor) toggles the panel.
- Actions: stage-less **commit** (message input) and **push**; "Commit &
  Push" combined button. **Guarded**: commit/push are outward-facing — confirm
  before push.
- Live update via `fs.watch` on `.git` / working tree (debounced).

**Integration:** main-process `git` via `simple-git` or raw `git` child
process in the session's cwd (`git status --porcelain`, `git diff`,
`git add/commit`, `git push`). No new heavy deps if raw git suffices.

**Depends on:** core shell. **UI ref:** Cursor right panel + bottom bar.

**Tests:** parse `git status --porcelain` → file-change view model; diff-stat
formatting.

---

## Sub-project 3 — Embedded terminal panel

**Goal:** Cursor's "Terminal" tab/panel scoped to the session cwd.

**Scope:**
- xterm.js frontend + `node-pty` in main, one pty per session terminal.
- Bottom-bar "N Terminal" chip; panel with tabs for multiple terminals.
- Resize/reflow, scrollback, copy/paste.

**Integration:** `node-pty` (native module — needs electron-rebuild against
Electron 41's ABI; document in build steps). IPC: spawn/write/resize/kill +
data stream to renderer.

**Depends on:** core shell. **Risk:** native module rebuild is the main
gotcha; pin and script it.

**Tests:** pty lifecycle manager (spawn/track/kill) with a fake pty.

---

## Sub-project 4 — Files panel

**Goal:** Cursor's "Files" tab — a file tree for the session's project.

**Scope:**
- Lazy-loaded tree (read dirs on expand), respects `.gitignore`.
- Click a file → read-only viewer with syntax highlighting (reuse
  highlight.js already in pi's deps, or shiki).
- Optional: reveal-in-Finder, open-in-editor.

**Integration:** main-process fs (`readdir`, `readFile`) scoped to cwd;
`ignore` package (already transitive via pi) for gitignore filtering.

**Depends on:** core shell. **Lowest risk.**

**Tests:** tree node builder + gitignore filter.

---

## Sub-project 5 — Browser preview panel

**Goal:** Cursor's "Browser" tab — preview a local dev server.

**Scope:**
- Electron `<webview>`/`WebContentsView` pointed at a URL (default
  `localhost:*`), with URL bar, reload, back/forward.
- Console/network capture optional (defer).

**Integration:** `WebContentsView` in main, or sandboxed `<webview>` tag with
strict partition. **Security:** isolate the partition; never share the app's
session.

**Depends on:** core shell. **YAGNI check:** only build if you actually want
in-app preview; the OS browser already works.

**Tests:** URL validation/normalization.

---

## Sub-project 6 — Automations

**Goal:** Cursor's "Automations" — scheduled/triggered pi runs.

**Scope:**
- Define an automation: workspace + prompt + schedule (cron-ish) or trigger.
- Runner: on schedule, spawn a headless `pi --print`/RPC run in the cwd,
  capture result, surface a notification + a session entry.
- List / enable / disable / delete automations; persist to a JSON store in
  userData.

**Integration:** `node-cron` or a minimal `setTimeout` scheduler (prefer the
latter — YAGNI on cron syntax unless needed); pi RPC/print mode for runs.

**Depends on:** core shell + sub-project 1 (session lifecycle). **Higher
complexity** (background execution, persistence, notifications).

**Tests:** schedule computation (next-run time); automation store CRUD.

---

## Sub-project 7 — Search & workspace management

**Goal:** Cursor's "Search" + workspace list polish.

**Scope:**
- **Search** across sessions (title + message text). `SessionInfo` already
  carries `allMessagesText`; index in main, filter in renderer. Fuzzy match.
- **Workspace management:** remove workspace, reorder, local/remote
  indicators, the filter/collapse controls Cursor shows in the Workspaces
  header.
- **New Agent** flow: choose workspace + optional starting model/prompt.

**Integration:** `SessionManager.listAll()` for cross-project search;
workspace registry gains remove/reorder.

**Depends on:** core shell. **Tests:** search ranking/filter over a fixture
session set.

---

## Sub-project 8 — Top bar & navigation chrome

**Goal:** Match Cursor's top bar and right "Open Tabs" rail.

**Scope:**
- Sidebar collapse toggle, back/forward through viewed sessions, breadcrumb
  (done partially), overflow "…" menu.
- Right "Open Tabs" rail listing the active panels (Terminal/Changes/Browser/
  Files) — this is the container that panels 2–5 dock into.
- Bottom status bar: branch name, Local/Remote, context-usage %
  (`get_session_stats` → `contextUsage.percent`).

**Depends on:** panels 2–5 (it hosts them). Build the rail early as a shell,
fill tabs as panels land.

**Tests:** context-% formatting; tab-registry reducer.

---

## Cross-cutting

### C1 — Packaging & distribution
- `electron-builder` → signed/notarized `.app` + DMG, so it launches like a
  normal Mac app (Dock, no terminal). Real template tray icon (replace the 1×1
  placeholder). Auto-update optional (defer).
- **Fixes the current "run from terminal" limitation.** Document the electron
  binary `ditto` workaround or resolve it properly in CI.

### C2 — Theming
- Dark theme + "follow macOS system" (the `read_me`/screenshot are light;
  dark is Cursor's other mode). CSS variables already centralize tokens.

### C3 — Security hardening (before packaging)
- Replace the permissive dev CSP with a **prod-strict CSP** applied via a
  main-process `onHeadersReceived` (dev stays loose for Vite). Remove
  `unsafe-inline`/`unsafe-eval` in prod.
- Keep sandbox on (already CJS preload); audit `<webview>` partition (SP5).

### C4 — Account / identity (optional)
- Cursor shows the signed-in user + plan. pi is key-based (no accounts), so
  show provider/auth status instead (from `auth.json` presence), not a login.

### C5 — Keyboard shortcuts
- Cmd+N new agent, Cmd+K search, Cmd+Enter send, Esc abort, Cmd+1..4 panels.

### C6 — Tests & CI
- Keep the pure-function unit tests per sub-project; add a smoke script that
  boots the app headlessly and asserts the shell mounts (catches the blank-
  screen class of bug we hit).

---

## Non-goals (YAGNI / out of scope)

- Cursor's editor/IDE, multi-file editing surface (this is an agent dashboard,
  not an editor).
- Cursor cloud, background cloud agents, "Refer friends", billing/plans.
- Cursor's own model backend — pi + its providers only.
- Auto-update, telemetry, crash reporting (until there are real users).

---

## Suggested build order

1. **SP1 Agent controls** — highest value; app is send-only today.
2. **SP2 Git changes** + **SP8 top-bar rail shell** — the rail hosts panels.
3. **SP4 Files** (low risk) → **SP3 Terminal** (native-module risk).
4. **SP7 Search / workspace mgmt.**
5. **SP5 Browser** (only if wanted) / **SP6 Automations** (heavier).
6. **C1 Packaging** + **C3 CSP hardening** once feature set is stable.
7. **C2 dark theme, C5 shortcuts, C6 CI** as polish throughout.

Effort is roughly descending within each group. SP1 first is the strong
recommendation.
