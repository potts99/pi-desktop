# Architecture Overview

**pi‑desktop** is an Electron‑based desktop application that provides a UI wrapper around the `pi` coding agent (a Cursor‑style "Agents Window").  The codebase is split into three logical layers:

1. **Main Process** – the privileged Node/Electron runtime.
2. **Renderer Process** – a React SPA that displays the UI.
3. **Shared Types / View‑Model** – data contracts used by both sides.

---

## 1️⃣ Main Process

The entry point is `src/main/index.ts`.  It creates a `BrowserWindow`, a tray icon, and registers IPC handlers via `src/main/ipc.ts`.

Key responsibilities:

- **Application lifecycle** (window creation, tray menu, quit handling).
- **Hydrating the shell PATH** on macOS so the bundled `pi` agent can be found.
- **IPC registration** – all calls from the renderer are funneled through `registerIpc` which wires up the various stores and runtimes.

### Core modules

| Module | Purpose |
|-------|---------|
|`session-runtime.ts`|Manages a single chat session – streams messages, handles `/task`, `/edit`, etc. |
|`advisor-runtime.ts`|Spawns the external `pi` process, forwards prompts, receives responses, and surfaces them via IPC. |
|`metrics-store.ts`|Collects per‑session usage metrics (tokens, latency, attribution). |
|`settings-store.ts`|Persists user preferences (theme, model picker, system prompt). |
|`advisor-store.ts`|Caches the *advisor* (system prompt + few‑shot) and provides a `getAdvisor` API. |
|`slash-resources.ts`|Static data for slash‑command autocomplete (e.g., `/edit`, `/search`). |
|`pinned.ts`|Keeps track of the “pinned” session that stays visible across tabs. |
|`workspaces.ts`|Handles multi‑workspace (future) configuration. |
|`sessions.ts`|A lightweight registry of open sessions and their IDs. |
|`ipc.ts`|Defines the IPC channel names and implements the request/response handlers that delegate to the modules above. |

All state is stored **in‑memory** while the app runs; persistence is handled by the stores (usually via JSON files under the user data directory).

---

## 2️⃣ Renderer Process

The UI lives under `src/renderer/`.  It is a standard **React + Vite** single‑page app bundled by `electron‑vite`.

- **`App.tsx`** – root component, sets up routing and global providers.
- **Components** – a collection of reusable UI pieces:
  - `Sidebar` – session list, pinned indicator, settings shortcut.
  - `Transcript` – scrollable chat view.
  - `InputBar` – text entry, slash‑command autocomplete, command palette trigger.
  - `MessageBlocks`, `WorkActivity`, `MetricsDashboard`, `DiffViewer` – specialised renderers for different message types.
  - `SettingsPanel` – UI for editing the system prompt, model picker, and other preferences.
- **State hooks** – `src/renderer/state/useSessions.ts` (and its tests) expose a thin wrapper around the main‑process IPC for:
  - Creating / deleting sessions.
  - Subscribing to session updates (messages, metrics, pinned flag).
  - Issuing user actions such as `sendMessage`, `runTask`, `runEdit`.
- **Command Palette** – `CommandPalette.tsx` provides a searchable list of actions (toggle sidebar, open settings, etc.) bound to `⌘K`.
- **Shortcut handling** – many UI actions are also reachable via Electron menu shortcuts (`⌘B` toggles the sidebar, `⌘⇧K` opens the command palette, etc.).

The renderer **never accesses the filesystem directly** – all data manipulation goes through the IPC layer, keeping the UI sandboxed.

---

## 3️⃣ Shared Types & View‑Model

Located in `src/shared/`:

- `types.ts` – TypeScript interfaces for messages, session metadata, metric buckets, and IPC request/response payloads.
- `view-model.ts` – Small utilities that transform raw backend data into shapes convenient for the UI (e.g., converting metric counters into chart‑ready arrays).

Both the main and renderer processes import these definitions, ensuring **type safety across the process boundary**.

---

## 4️⃣ Data Flow Summary

1. **User interaction** in the renderer (typing a prompt, selecting a slash command, or clicking a toolbar button) calls a hook in `useSessions`.
2. The hook sends an **IPC request** (`ipcRenderer.invoke`) to the main process.
3. The main process routes the request to the appropriate **store/runtime** (e.g., `session-runtime.sendMessage`).
4. The runtime may spawn the external `pi` binary, stream results back via an **event channel**, and update the **metrics‑store**.
5. The main process pushes a **notification** (`ipcMain.emit`) back to the renderer, where the hook updates React state and the UI re‑renders.

---

## 5️⃣ Future Directions (Business Domains)

- **Multi‑Workspace** – currently scaffolded (`src/main/workspaces.ts`).  Intended to let power‑users keep separate collections of sessions.
- **Agent Extensions** – slash commands (`/task`, `/edit`, `/search`, `/plan`, `/run`) map to backend “advisor” capabilities.  New extensions can be added by extending `slash-resources` and the `advisor-runtime`.
- **Telemetry & Usage Metrics** – `metrics-store` aggregates token usage, latency, and attribution.  This data drives the **Metrics Dashboard** UI and can be exported for analytics.
- **Plugin System** – not yet implemented, but the architecture (IPC‑based command registration) is already conducive to third‑party plugins that expose additional IPC endpoints.

---

## 6️⃣ Where to Find More Details

- **Backend implementation** – `openwiki/backend.md`
- **Renderer details** – `openwiki/renderer.md`
- **IPC contract** – `openwiki/ipc.md`
- **Store documentation** – `openwiki/stores.md`
- **Slash‑command reference** – `openwiki/commands.md`

This document provides a high‑level map; the linked pages dive into each subsystem in depth.
