# Backend Overview

The **backend** of *pi‑desktop* lives entirely in the Electron **main process**.  Its purpose is to host the `pi` coding agent, manage session state, expose a stable IPC contract, and persist user settings & metrics.

---

## Core Runtimes

| Runtime | File | Primary responsibilities |
|---------|------|--------------------------|
|**Advisor Runtime**|`src/main/advisor-runtime.ts`|Spawns the external `pi` binary, forwards prompts (including system prompt, user messages, and *slash* commands), streams back responses, and surface them via IPC events. Handles the `getAdvisor` call which loads the system prompt and any cached assistant context.
|**Session Runtime**|`src/main/session-runtime.ts`|Represents a single chat session. Coordinates message flow between the UI and the Advisor Runtime, tracks per‑session metrics, and implements higher‑level actions like `/task`, `/edit`, `/search`, `/plan`, and `/run`. Exposes methods for sending messages, aborting a running task, and retrieving statistics.
|**Metrics Store**|`src/main/metrics-store.ts`|Collects telemetry for each session: token usage, latency, attribution (which model generated which part), and activity timestamps. Provides both a per‑session snapshot and aggregate data used by the **Metrics Dashboard** UI.
|**Settings Store**|`src/main/settings-store.ts`|Persists UI preferences (theme, default model, window geometry, system prompt overrides). Uses Electron’s `app.getPath('userData')` to write a JSON file.
|**Advisor Store**|`src/main/advisor-store.ts`|Caches the *advisor* (a pre‑prompt that configures the underlying `pi` agent) and offers `getAdvisor`, `setAdvisor`, and a simple versioning mechanism.
|**Slash Resources**|`src/main/slash-resources.ts`|Static metadata for slash‑command autocomplete – titles, descriptions, and argument schemas. The UI reads this via IPC to render the command palette.
|**Pinned Store**|`src/main/pinned.ts`|Tracks the ID of the *pinned* session that remains visible when the user switches tabs.
|**Workspaces**|`src/main/workspaces.ts`|Placeholder for future multi‑workspace support (currently a thin wrapper around a JSON file).
|**Sessions Registry**|`src/main/sessions.ts`|In‑memory map of active session IDs to runtime instances, exposing enumeration and lookup helpers used by the renderer.

---

## IPC Contract (`src/main/ipc.ts`)

All communication between the renderer and the backend is funneled through **Electron’s `ipcMain.handle` / `ipcRenderer.invoke`** API.  The file defines a set of channel names that map directly to the methods above, for example:

- `getSettings` → `settingsStore.get()`
- `setSettings` → `settingsStore.set(payload)`
- `createSession` → `sessions.create()`
- `sendMessage` → `sessionRuntime.sendMessage(sessionId, message)`
- `runTask` / `runEdit` / `runSearch` → delegated to `sessionRuntime.runSlashCommand`
- `getMetrics` → `metricsStore.get(sessionId)`
- `getAdvisor` → `advisorStore.get()`

Both sides share the TypeScript definitions from **`src/shared/types.ts`**, guaranteeing payload shape compatibility.

---

## Persistence Model

- **User data directory** – `app.getPath('userData')` (e.g., `~/Library/Application Support/pi-desktop`). All JSON files (`settings.json`, `metrics.json`, `sessions.json`, etc.) live here.
- **Atomic writes** – Stores write to a temporary file then rename to avoid corruption on crash.
- **Versioning** – Each store includes a `version` field; on load the main process can migrate older shapes if needed.

---

## Extending the Backend

To add a new feature:

1. **Add a store or runtime module** under `src/main/`.
2. **Export its public API** (functions that accept plain JSON payloads).
3. **Register a new IPC handler** in `ipc.ts` that forwards the request to the module.
4. **Update `src/shared/types.ts`** with request/response interfaces.
5. **Write unit tests** (the repo uses Vitest – see existing `*.test.ts` files).

The architecture purposely keeps the renderer **thin**; any heavy lifting, external process spawning, or filesystem access stays in the main process, preserving security and stability.

---

## Where to Look Next

- Detailed UI component walkthrough – see `openwiki/renderer.md`.
- Full IPC specification – see `openwiki/ipc.md`.
- Store-specific documentation – see `openwiki/stores.md`.
- Command‑palette and slash‑command reference – see `openwiki/commands.md`.
