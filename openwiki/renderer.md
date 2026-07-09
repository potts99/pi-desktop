# Renderer Documentation

The **renderer** is a React application bundled with Vite and run inside an Electron `BrowserWindow`.  It provides the interactive UI for the pi‑desktop agent window: session list, chat transcript, input bar, metrics dashboard, settings, and command palette.

---

## Project Structure

```
src/renderer/
├─ App.tsx                     # Root component, sets up providers & layout
├─ index.html                  # Minimal HTML entry point
├─ main.tsx                    # ReactDOM.render entry point
├─ env.d.ts                    # Vite env typings
├─ components/                # Re‑usable UI widgets
│   ├─ Sidebar.tsx             # Session list, pinned indicator, shortcuts
│   ├─ Transcript.tsx          # Scrollable chat view
│   ├─ InputBar.tsx            # Text entry, slash‑command autocomplete
│   ├─ MessageBlocks.tsx       # Renders various message block types (text, code, diff)
│   ├─ WorkActivity.tsx        # Timeline view for activity heat‑map
│   ├─ MetricsDashboard.tsx    # Charts for token usage, latency, etc.
│   ├─ SettingsPanel.tsx       # UI for editing system prompt, model picker, theme
│   ├─ CommandPalette.tsx      # Searchable list of actions (⌘K)
│   └─ DiffViewer.tsx          # Inline diff viewer for `/edit` results
├─ state/                     # Custom React hooks that wrap IPC
│   └─ useSessions.ts          # Core hook exposing session CRUD & actions
├─ styles/                    # Global CSS (glass.css, theme variables)
└─ utils/ (if any)           # Small helpers used by components
```

---

## Core Hook – `useSessions`

`useSessions` lives in `src/renderer/state/useSessions.ts`.  It abstracts the IPC layer and provides a type‑safe React API for the UI.

Key exported members:

- `sessions: SessionInfo[]` – list of open sessions with metadata (id, title, pinned, stats).
- `activeSessionId: string | null` – currently selected session.
- `createSession(): Promise<string>` – asks the main process to create a new session and returns its ID.
- `deleteSession(id: string): Promise<void>` – removes a session.
- `sendMessage(id: string, content: string): Promise<void>` – forwards a user prompt to the session runtime.
- `runSlashCommand(id: string, command: string, args?: any): Promise<void>` – generic entry for `/task`, `/edit`, `/search`, etc.
- `subscribe(callback: (update: SessionUpdate) => void): () => void` – registers a listener for real‑time updates emitted by the main process (new messages, metric changes, pin state).

All functions internally use **`ipcRenderer.invoke`** with channel names defined in `src/shared/types.ts`.  Errors are caught and re‑thrown as JavaScript `Error` objects for the UI to display.

---

## UI Components Overview

### `App.tsx`
- Sets up the **`ThemeProvider`** (light/dark based on settings).
- Wraps the UI in **`ErrorBoundary`** to catch render errors.
- Renders the `Sidebar` and the main panel (`Transcript` + `InputBar`).
- Registers global shortcuts (e.g., `⌘B` toggles the sidebar) using Electron's `Menu` API via the main process.

### `Sidebar.tsx`
- Lists sessions via `useSessions.sessions`.
- Shows a **pin icon** next to the pinned session (managed by `pinned.ts`).
- Allows creating a new session (`+` button) and selecting an existing one.
- Provides a button to open the **SettingsPanel**.

### `Transcript.tsx`
- Receives the current session’s messages from the `useSessions` hook.
- Uses **`react-virtualized`**‑style rendering for large chats.
- Handles auto‑scroll to bottom on new messages, with a *sticky* toggle.

### `InputBar.tsx`
- Textarea with **dynamic height** (grows as you type).
- Detects **slash commands** (`/task`, `/edit`, `/search`, …) and shows an autocomplete dropdown based on data from `slash-resources`.
- On **Enter** it either sends a normal message or executes the selected slash command.
- Shortcut `⌘K` opens the `CommandPalette`.

### `MessageBlocks.tsx`
- Renders a message as a collection of **blocks** (plain text, code snippets, markdown, diffs).
- Code blocks are syntax‑highlighted with `prismjs`.
- Diff blocks use `DiffViewer` to show side‑by‑side changes.

### `WorkActivity.tsx`
- Visualises per‑session activity over the past week as a heat‑map (similar to GitHub contributions).
- Data comes from the **metrics store** via the `getMetrics` IPC call.

### `MetricsDashboard.tsx`
- Shows charts for **token usage**, **latency**, **model attribution**, and **session statistics**.
- Uses the lightweight `chart.js` wrapper (no heavy dependencies).

### `SettingsPanel.tsx`
- Lets the user edit the **system prompt**, select a **model**, toggle **dark mode**, and configure other preferences.
- Persists changes via `setSettings` IPC call.

### `CommandPalette.tsx`
- Searchable list of actions (toggle sidebar, open settings, clear all sessions, quit).  Triggered by `⌘K`.
- Implemented with a simple fuzzy‑search over a static command list defined in `/src/main/commands.ts` (exposed via IPC).

---

## Styling & Theming

- Global stylesheet `src/renderer/styles/glass.css` implements the **glass‑morphism** look used throughout the app (blurred backgrounds, light borders).
- Theme variables (`--bg`, `--text`, `--accent`) are set on the `:root` element based on the stored theme (light/dark) and are referenced throughout component CSS modules.
- Components use **CSS modules** (`Component.module.css`) where appropriate, importing them directly into the TSX file.

---

## Shortcuts & Keyboard Interaction

| Shortcut | Action |
|----------|--------|
| `⌘B` | Toggle the sidebar visibility |
| `⌘K` | Open the command palette |
| `⌘⇧K` | Open the settings panel |
| `⌘Enter` (in InputBar) | Send the current message without newline |
| `↑/↓` (in InputBar) | Navigate slash‑command autocomplete list |
| `Esc` | Close any open popup (autocomplete, command palette) |

Shortcuts are registered in the **main process** via Electron `Menu` items; the renderer reflects the current state (e.g., hiding the sidebar).

---

## Data Flow Recap (Renderer → Main)

1. UI component calls a function from `useSessions`.
2. The hook invokes `ipcRenderer.invoke('channel', payload)`.
3. Main process (`src/main/ipc.ts`) receives the request, delegates to a store/runtime.
4. The runtime performs the operation (e.g., spawns `pi`, updates metrics).
5. Main process emits an event (`ipcMain.emit('session-updated', data)`).
6. The renderer’s subscription callback updates React state → UI re‑renders.

---

## Testing

- Component tests live alongside components (`Component.test.tsx`) and use **Vitest** with **@testing-library/react**.
- The `useSessions` hook is unit‑tested in `src/renderer/state/useSessions.test.tsx` via mocked IPC responses.
- End‑to‑end behavior is exercised by the **main‑process tests** (`src/main/*.test.ts`) which mock the renderer using `electron-mocha` utilities.

---

## Extending the Renderer

To add a new UI feature:

1. **Add a component** under `src/renderer/components/`.
2. **Import it** in `App.tsx` or the appropriate parent.
3. If the component needs to interact with the backend, **extend `useSessions`** (or create a new hook) to expose the required IPC channel.
4. **Update `src/shared/types.ts`** with any new request/response interfaces.
5. Write **unit tests** for the component and the hook.
6. Add a section to this OpenWiki page describing the new component and its purpose.

---

## Where to Find More Information

- **IPC specification** – `openwiki/ipc.md`
- **Store documentation** – `openwiki/stores.md`
- **Command reference** – `openwiki/commands.md`
- **Architecture overview** – `openwiki/architecture.md`

This page should give developers a clear mental model of the renderer’s layout, state management, and extension points.
