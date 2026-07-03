# pi-desktop: Core Shell — Design

## Goal

Replicate the *look and feel* of Cursor's "Agents Window" (a dedicated
session-management dashboard: sidebar of agent sessions grouped by
workspace, center chat transcript, bottom input bar with a model picker),
backed by the [pi](https://github.com/earendil-works/pi) coding agent
instead of Cursor's own agent.

This is sub-project 1 of a larger "full replica" effort. Later sub-projects
(not designed here) add: a git changes panel, an embedded terminal, a files
tree, a browser preview panel, automations, and a polished
workspace-switcher/search UI. This spec covers only the foundation those
build on: the app shell, session sidebar, chat transcript, and pi
integration.

We are **not** decompiling or extracting Cursor's app bundle/source. The
visual language (glassmorphism-adjacent, dense dashboard layout) is
reimplemented from scratch based on observed behavior.

## Why pi fits this shape

- Sessions are already first-class: `~/.pi/agent/sessions/--<encoded-cwd>--/<timestamp>_<uuid>.jsonl`,
  one file per session, JSONL of typed entries (see pi's `session-format.md`).
  This maps directly onto "workspace → session list" in the sidebar.
- `@earendil-works/pi-coding-agent` (already installed locally, pulled in as
  a normal npm dependency) exports `SessionManager.list(cwd)` /
  `SessionManager.listAll()` for enumerating sessions, and `RpcClient` — a
  ready-made class that spawns `pi --mode rpc`, handles JSONL framing, and
  exposes typed methods (`prompt`, `steer`, `switchSession`, `getEntries`,
  `onEvent`, etc.). We use both directly rather than reimplementing session
  directory parsing or the RPC wire protocol.

## Architecture

Standard two-process Electron app.

### Main process (Node)

- **Tray**: a menu-bar icon toggles the single `BrowserWindow`'s visibility
  (show/hide, never destroy, so open sessions keep running in the
  background).
- **Workspace registry**: a short list of project folder paths, persisted
  as one JSON file in `app.getPath('userData')`. Adding a workspace uses
  the native folder picker (`dialog.showOpenDialog`). No database — the
  list is small.
- **Session listing**: for each workspace, `SessionManager.list(cwd)`
  returns session metadata (file path, id, timestamp, session name if set).
  No custom parsing of the `--path--` directory encoding.
- **Session runtime**: one `RpcClient` per *open* session tab, started when
  a session is selected or created, stopped when its tab closes (not kept
  alive indefinitely — avoids accumulating idle pi processes). Resuming an
  existing session passes `--session <path>` via `RpcClientOptions.args`;
  creating a new session starts a fresh `RpcClient` scoped to the
  workspace's `cwd` with no `--session` arg.
- **IPC**: `contextBridge` + `contextIsolation: true` (no `nodeIntegration`
  in the renderer). Exposed actions: `listWorkspaces`, `addWorkspace`,
  `listSessions(workspacePath)`, `openSession({path} | {new: true, cwd})`,
  `closeSession(sessionKey)`, `sendPrompt(sessionKey, text)`,
  `getAvailableModels(sessionKey)`, `setModel(sessionKey, provider, modelId)`.
  RPC events forwarded to the renderer via `webContents.send('session-event', {sessionKey, event})`.
- **Live sidebar updates**: `fs.watch` on each open workspace's session
  directory, so sessions created outside the app (e.g. from a terminal)
  appear without polling.

### Renderer (React + Vite)

- **Sidebar**: workspaces as collapsible groups, sessions within each
  sorted by recency with a preview (session name if set, else first user
  message, truncated) and relative timestamp. "New Agent" button at the
  top starts a new session in a chosen workspace.
- **Transcript**: renders `AssistantMessage` / `UserMessage` /
  `ToolResultMessage` content blocks for the selected session.
  - Text blocks: `react-markdown` + `remark-gfm` (tables, checkboxes — as
    seen in Cursor's own transcript rendering).
  - Tool calls: collapsible cards (tool name + args + result summary).
  - Assistant text streams incrementally via `message_update` /
    `text_delta` events.
- **Input bar**: textarea + send button + a model/provider picker
  populated from `getAvailableModels()`.

## Data flow

1. User clicks a session in the sidebar (or "New Agent").
2. Main process starts (or reuses) an `RpcClient` for that session.
3. Renderer calls `sendPrompt` → main calls `RpcClient.prompt()`.
4. `message_update`, `tool_execution_*`, `agent_end` events stream back
   over IPC and render incrementally.
5. Everything is simultaneously persisted to the session's `.jsonl` by pi
   itself, so app restarts lose nothing — reopening a session just replays
   history via `getEntries()`.

## Error handling

- `RpcClient` process crash, or a `{success:false}` RPC response, surfaces
  as an inline error banner in that session's transcript with a retry
  action.
- Each session is its own OS process, so one crashing session cannot affect
  others.

## Testing

Most of this sub-project is IPC plumbing and React rendering, verified by
running the app manually. The one piece of real branching logic — mapping
`SessionManager.list()` output into the sidebar view model (grouping by
workspace, sorting by recency, computing preview text) — gets a small unit
test.

## Explicitly out of scope for this spec

Queued as later sub-projects: git changes panel, embedded terminal, files
tree, browser preview panel, automations, workspace-switcher/search UI
polish, thinking-level picker, packaging/code-signing for distribution.
