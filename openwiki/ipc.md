# IPC Specification

This document describes the **Electron IPC** contract between the renderer process (React UI) and the main process (Node/Electron backend) for **pi‑desktop**.

All IPC channels are registered in `src/main/ipc.ts` using `ipcMain.handle`. The renderer accesses them through the `Api` interface defined in `src/shared/types.ts` (see the `Api` section for the TypeScript signatures).

## Channel list

| Channel | Purpose | Arguments | Returns |
|---|---|---|---|
| `listWorkspaces` | Enumerate configured workspaces | — | `Promise<string[]>` |
| `addWorkspace` | Open folder picker, add workspace | — | `Promise<string[]>` |
| `removeWorkspace` | Delete a workspace entry | `path: string` | `Promise<string[]>` |
| `listSessions` | List sessions for a workspace | `cwd: string` | `Promise<SessionRow[]>` |
| `listChatSessions` | List "chat" sessions (no workspace) | — | `Promise<SessionRow[]>` |
| `listWorkspaceFiles` | File‑completion helper for the UI | `cwd: string, prefix: string` | `Promise<string[]>` |
| `listSlashCommands` | Autocomplete data for `/` commands | `cwd: string|null` | `Promise<SlashCommand[]>` |
| `listGitBranches` | Git branch enumeration | `cwd: string` | `Promise<GitBranchInfo>` |
| `checkoutGitBranch` | Switch git branch | `cwd: string, branch: string` | `Promise<void>` |
| `openSession` | Open existing or create new session | `{path:string,cwd?:string}` or `{newIn:string}` or `{newChat:true}` | `{sessionKey:string, messages:TranscriptMessage[], state:SessionState}` |
| `closeSession` | Close a session | `sessionKey: string` | `Promise<void>` |
| `sendPrompt` | Send a user prompt (or steering/follow‑up) | `sessionKey:string, text:string, mode?` | `Promise<void>` |
| `abortSession` | Abort current turn | `sessionKey:string` | `Promise<void>` |
| `respondToUiRequest` | Reply to a UI request (select, confirm, etc.) | `sessionKey:string, response:SessionUiResponse` | `Promise<void>` |
| `getModels` | List models available for a session | `sessionKey:string` | `Promise<ModelChoice[]>` |
| `setModel` | Change model for a session | `sessionKey:string, provider:string, id:string` | `Promise<void>` |
| `getSessionState` | Retrieve mutable session state | `sessionKey:string` | `Promise<SessionState>` |
| `setMode` / `setThinkingLevel` / `cycleThinkingLevel` | Update session configuration | `sessionKey:string, …` | `Promise<…>` |
| `forkSession` / `cloneSession` | Create a new session from an existing one | `sessionKey:string, entryId:string?` | `Promise<SessionReplacement>` |
| `renameSession` | Change session title | `sessionKey:string, name:string` | `Promise<void>` |
| `deleteSession` | Delete session files | `sessionPath:string` | `Promise<void>` |
| `getSessionStats` | Retrieve metrics snapshot | `sessionKey:string` | `Promise<SessionStatsInfo>` |
| `getMetricsSummary` / `refreshMetricsBackfill` | Metrics dashboard data | `filter?:MetricsFilter` | `Promise<MetricsSummary>` |
| `getLastAssistantText` | Get most recent assistant reply text | `sessionKey:string` | `Promise<string|null>` |
| Window controls (`closeWindow`, `maximizeWindow`, `minimizeWindow`, `unmaximizeWindow`, `isMaximized`, `isFullScreen`) | Manipulate the Electron window | — | `Promise<void>` or `Promise<boolean>` |
| `openInVSCode` | Open a file/folder in VS Code | `path:string` | `Promise<void>` |
| `isVSCodeAvailable` | Check if VS Code command line is available | — | `Promise<boolean>` |
| `getSharedModels` | List models shared across sessions (optional sessionKey) | `sessionKey?:string` | `Promise<ModelChoice[]>` |

## Error handling

All handlers reject with a JavaScript `Error`. The renderer receives the error via the rejected promise, which the UI surfaces as a toast notification.

## Versioning

The IPC contract is version‑stable because all channels are defined in TypeScript and the `Api` interface is shared between both processes. Adding new channels is safe; removing or changing existing ones requires a major version bump.
