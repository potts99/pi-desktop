# pi-desktop Core Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A menu-bar Electron app that reproduces Cursor's "Agents Window" (sidebar of pi sessions grouped by workspace, center chat transcript, bottom input bar with model picker), driving the pi coding agent via its `RpcClient`.

**Architecture:** Two-process Electron app. Main process owns a tray toggle, a JSON-file workspace registry, session enumeration via `SessionManager.list()`, and one `RpcClient` per open session; it forwards RPC events to the renderer over IPC. Renderer is React + Vite: sidebar, transcript, input bar. Styling tokens are mined from Cursor's `workbench.glass.main.css` (reference only — no code copied).

**Tech Stack:** Electron, electron-vite, React 18, TypeScript, Vite, `@earendil-works/pi-coding-agent` (SessionManager + RpcClient), react-markdown + remark-gfm, vitest.

**Spec:** `docs/superpowers/specs/2026-07-03-core-shell-design.md`

---

## File Structure

```
pi-desktop/
  package.json
  electron.vite.config.ts        # electron-vite: main/preload/renderer builds
  tsconfig.json
  tsconfig.node.json
  vitest.config.ts
  src/
    main/
      index.ts                   # app lifecycle, window, tray
      workspaces.ts              # JSON-file workspace registry (userData)
      sessions.ts                # SessionManager.list wrappers + fs.watch
      session-runtime.ts         # RpcClient pool: open/close/prompt/models
      ipc.ts                     # ipcMain handlers wiring the above
    preload/
      index.ts                   # contextBridge API surface
    shared/
      view-model.ts              # PURE: SessionInfo[] -> sidebar view model
      view-model.test.ts         # the one unit test
      types.ts                   # IPC payload/event types shared main<->renderer
    renderer/
      index.html
      main.tsx                   # React root
      App.tsx                    # layout: sidebar | transcript | input
      components/
        Sidebar.tsx
        Transcript.tsx
        MessageBlocks.tsx        # renders text/tool-call/tool-result blocks
        InputBar.tsx             # textarea + send + model picker
      state/useSessions.ts       # renderer-side session state + event handling
      styles/glass.css           # tokens mined from workbench.glass.main.css
```

**Design-token source (reference during styling tasks):**
`/Applications/Cursor.app/Contents/Resources/app/out/vs/workbench/workbench.glass.main.css`

---

## Task 1: Project scaffold

**Files:**
- Create: `package.json`, `electron.vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `vitest.config.ts`, `.gitignore`, `src/renderer/index.html`, `src/renderer/main.tsx`, `src/main/index.ts`, `src/preload/index.ts`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "pi-desktop",
  "version": "0.0.1",
  "description": "Cursor Agents Window, backed by pi",
  "main": "out/main/index.js",
  "type": "module",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "start": "electron-vite preview",
    "test": "vitest run",
    "typecheck": "tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.json"
  },
  "dependencies": {
    "@earendil-works/pi-coding-agent": "^0.80.3",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-markdown": "^9.0.1",
    "remark-gfm": "^4.0.0"
  },
  "devDependencies": {
    "@types/node": "^22.7.4",
    "@types/react": "^18.3.11",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.2",
    "electron": "^32.1.2",
    "electron-vite": "^2.3.0",
    "typescript": "^5.6.2",
    "vite": "^5.4.8",
    "vitest": "^2.1.2"
  }
}
```

- [ ] **Step 2: Create `.gitignore`**

```
node_modules/
out/
dist/
.DS_Store
```

- [ ] **Step 3: Create `electron.vite.config.ts`**

```ts
import { resolve } from "node:path";
import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        // pi package is CJS-friendly ESM; keep it external so Node resolves it at runtime
        external: ["@earendil-works/pi-coding-agent"],
      },
    },
  },
  preload: {},
  renderer: {
    root: "src/renderer",
    build: {
      rollupOptions: { input: resolve(__dirname, "src/renderer/index.html") },
    },
    plugins: [react()],
  },
});
```

- [ ] **Step 4: Create `tsconfig.node.json`** (main + preload + shared)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["src/main", "src/preload", "src/shared", "electron.vite.config.ts"]
}
```

- [ ] **Step 5: Create `tsconfig.json`** (renderer)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src/renderer", "src/shared"]
}
```

- [ ] **Step 6: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["src/**/*.test.ts"], environment: "node" },
});
```

- [ ] **Step 7: Create `src/renderer/index.html`**

```html
<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; style-src 'self' 'unsafe-inline'" />
    <title>pi</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 8: Create placeholder `src/renderer/main.tsx`**

```tsx
import { createRoot } from "react-dom/client";
createRoot(document.getElementById("root")!).render(<div>pi-desktop</div>);
```

- [ ] **Step 9: Create minimal `src/preload/index.ts`** (fleshed out in Task 5)

```ts
// Placeholder; real API added in Task 5.
export {};
```

- [ ] **Step 10: Create minimal `src/main/index.ts`** (fleshed out in Task 4)

```ts
import { app, BrowserWindow } from "electron";

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({ width: 1200, height: 800, show: true });
  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    win.loadFile("out/renderer/index.html");
  }
  return win;
}

app.whenReady().then(() => createWindow());
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
```

- [ ] **Step 11: Install deps**

Run: `npm install`
Expected: completes without error; `node_modules/@earendil-works/pi-coding-agent/dist/cli.js` exists.

- [ ] **Step 12: Verify dev boots**

Run: `npm run dev` (then Ctrl-C after the window shows "pi-desktop")
Expected: an Electron window opens showing the text "pi-desktop".

- [ ] **Step 13: Commit**

```bash
git add -A && git commit -m "chore: scaffold electron-vite + react app shell"
```

---

## Task 2: Shared types

**Files:**
- Create: `src/shared/types.ts`

- [ ] **Step 1: Define IPC/view types**

```ts
// Sidebar view model produced by view-model.ts
export interface SessionRow {
  path: string;
  id: string;
  title: string;        // name || firstMessage || "New session"
  subtitle: string;     // relative time string
  modifiedMs: number;
  messageCount: number;
}

export interface WorkspaceGroup {
  path: string;         // workspace cwd
  name: string;         // basename of path
  sessions: SessionRow[];
}

// A transcript entry the renderer knows how to draw.
export type Block =
  | { kind: "text"; text: string }
  | { kind: "thinking"; text: string }
  | { kind: "toolCall"; id: string; name: string; args: unknown }
  | { kind: "toolResult"; toolCallId: string; toolName: string; text: string; isError: boolean };

export interface TranscriptMessage {
  role: "user" | "assistant" | "tool";
  blocks: Block[];
}

export interface ModelChoice {
  provider: string;
  id: string;
}

// Events pushed main -> renderer for an open session.
export type SessionEvent =
  | { kind: "reset"; messages: TranscriptMessage[] }   // full history on open
  | { kind: "assistantDelta"; text: string }           // streamed text
  | { kind: "message"; message: TranscriptMessage }    // a completed message
  | { kind: "idle" }                                   // agent_end
  | { kind: "error"; message: string };

export interface Api {
  listWorkspaces(): Promise<string[]>;
  addWorkspace(): Promise<string[]>;                    // opens folder picker, returns new list
  listSessions(workspacePath: string): Promise<SessionRow[]>;
  openSession(arg: { path: string } | { newIn: string }): Promise<{ sessionKey: string }>;
  closeSession(sessionKey: string): Promise<void>;
  sendPrompt(sessionKey: string, text: string): Promise<void>;
  getModels(sessionKey: string): Promise<ModelChoice[]>;
  setModel(sessionKey: string, provider: string, id: string): Promise<void>;
  onSessionEvent(cb: (sessionKey: string, ev: SessionEvent) => void): () => void;
  onSessionsChanged(cb: (workspacePath: string) => void): () => void;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/shared/types.ts && git commit -m "feat: shared IPC and view-model types"
```

---

## Task 3: Sidebar view model (the one unit test)

**Files:**
- Create: `src/shared/view-model.ts`
- Test: `src/shared/view-model.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { toSessionRows, relativeTime } from "./view-model.ts";
import type { SessionInfo } from "@earendil-works/pi-coding-agent";

function info(over: Partial<SessionInfo>): SessionInfo {
  return {
    path: "/s/a.jsonl", id: "a", cwd: "/proj", name: undefined,
    created: new Date(0), modified: new Date(0),
    messageCount: 1, firstMessage: "hi", allMessagesText: "hi", ...over,
  };
}

describe("toSessionRows", () => {
  it("sorts by modified desc and derives title from name > firstMessage", () => {
    const rows = toSessionRows(
      [
        info({ id: "old", modified: new Date(1000), firstMessage: "older" }),
        info({ id: "new", modified: new Date(5000), name: "My work" }),
      ],
      new Date(10000),
    );
    expect(rows.map((r) => r.id)).toEqual(["new", "old"]);
    expect(rows[0].title).toBe("My work");
    expect(rows[1].title).toBe("older");
  });

  it("falls back to 'New session' when empty and truncates long titles", () => {
    const long = "x".repeat(200);
    const rows = toSessionRows(
      [info({ id: "empty", firstMessage: "", name: undefined }),
       info({ id: "long", firstMessage: long })],
      new Date(10000),
    );
    const empty = rows.find((r) => r.id === "empty")!;
    const lng = rows.find((r) => r.id === "long")!;
    expect(empty.title).toBe("New session");
    expect(lng.title.length).toBeLessThanOrEqual(80);
  });
});

describe("relativeTime", () => {
  it("formats recent as minutes/hours and old as days", () => {
    const now = new Date(1_000_000_000_000);
    expect(relativeTime(new Date(now.getTime() - 5 * 60_000), now)).toBe("5m");
    expect(relativeTime(new Date(now.getTime() - 3 * 3_600_000), now)).toBe("3h");
    expect(relativeTime(new Date(now.getTime() - 2 * 86_400_000), now)).toBe("2d");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `view-model.ts` has no such exports.

- [ ] **Step 3: Implement `src/shared/view-model.ts`**

```ts
import type { SessionInfo } from "@earendil-works/pi-coding-agent";
import type { SessionRow } from "./types.ts";

const MAX_TITLE = 80;

export function relativeTime(when: Date, now: Date = new Date()): string {
  const s = Math.max(0, Math.floor((now.getTime() - when.getTime()) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function title(s: SessionInfo): string {
  const raw = (s.name?.trim() || s.firstMessage?.trim() || "") as string;
  if (!raw) return "New session";
  return raw.length > MAX_TITLE ? raw.slice(0, MAX_TITLE - 1) + "…" : raw;
}

export function toSessionRows(sessions: SessionInfo[], now: Date = new Date()): SessionRow[] {
  return sessions
    .slice()
    .sort((a, b) => b.modified.getTime() - a.modified.getTime())
    .map((s) => ({
      path: s.path,
      id: s.id,
      title: title(s),
      subtitle: relativeTime(s.modified, now),
      modifiedMs: s.modified.getTime(),
      messageCount: s.messageCount,
    }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS (5 assertions across 3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/shared/view-model.ts src/shared/view-model.test.ts
git commit -m "feat: sidebar view-model mapper with unit tests"
```

---

## Task 4: Main process — workspaces, sessions, runtime, IPC

**Files:**
- Create: `src/main/workspaces.ts`, `src/main/sessions.ts`, `src/main/session-runtime.ts`, `src/main/ipc.ts`
- Modify: `src/main/index.ts`

- [ ] **Step 1: `src/main/workspaces.ts` — JSON registry**

```ts
import { app } from "electron";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const file = () => join(app.getPath("userData"), "workspaces.json");

export function listWorkspaces(): string[] {
  try {
    if (!existsSync(file())) return [];
    return JSON.parse(readFileSync(file(), "utf8")) as string[];
  } catch {
    return [];
  }
}

export function addWorkspace(path: string): string[] {
  const cur = listWorkspaces();
  if (!cur.includes(path)) cur.push(path);
  writeFileSync(file(), JSON.stringify(cur, null, 2));
  return cur;
}
```

- [ ] **Step 2: `src/main/sessions.ts` — listing + watch**

```ts
import { watch, type FSWatcher } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { toSessionRows } from "../shared/view-model.ts";
import type { SessionRow } from "../shared/types.ts";

export async function listSessions(cwd: string): Promise<SessionRow[]> {
  const infos = await SessionManager.list(cwd);
  return toSessionRows(infos);
}

// pi encodes the session dir as ~/.pi/agent/sessions/--<cwd with / -> ->--
function sessionDirFor(cwd: string): string {
  const encoded = "--" + cwd.replace(/\//g, "-") + "--";
  return join(homedir(), ".pi", "agent", "sessions", encoded);
}

export function watchSessions(cwd: string, onChange: () => void): FSWatcher | null {
  try {
    return watch(sessionDirFor(cwd), { persistent: false }, () => onChange());
  } catch {
    return null; // dir may not exist until first session; fs.watch throws — caller ignores
  }
}
```

- [ ] **Step 3: `src/main/session-runtime.ts` — RpcClient pool**

Note: `RpcClient` emits raw `AgentEvent`s. We translate them to our `SessionEvent` union. `cliPath` is resolved explicitly so it works from the packaged app.

```ts
import { createRequire } from "node:module";
import { RpcClient } from "@earendil-works/pi-coding-agent";
import type { AgentEvent, AgentMessage } from "@earendil-works/pi-agent-core";
import type { ModelChoice, SessionEvent, TranscriptMessage, Block } from "../shared/types.ts";

const require = createRequire(import.meta.url);
const cliPath = require.resolve("@earendil-works/pi-coding-agent/dist/cli.js");

interface Entry { client: RpcClient; cwd: string; }
const pool = new Map<string, Entry>();
let counter = 0;

function toBlocks(msg: AgentMessage): TranscriptMessage | null {
  if (msg.role === "user") {
    const text = typeof msg.content === "string"
      ? msg.content
      : msg.content.map((c) => ("text" in c ? c.text : "")).join("");
    return { role: "user", blocks: [{ kind: "text", text }] };
  }
  if (msg.role === "assistant") {
    const blocks: Block[] = [];
    for (const c of msg.content) {
      if (c.type === "text") blocks.push({ kind: "text", text: c.text });
      else if (c.type === "thinking") blocks.push({ kind: "thinking", text: c.thinking });
      else if (c.type === "toolCall") blocks.push({ kind: "toolCall", id: c.id, name: c.name, args: c.arguments });
    }
    return { role: "assistant", blocks };
  }
  if (msg.role === "toolResult") {
    const text = msg.content.map((c) => ("text" in c ? c.text : "[non-text]")).join("");
    return { role: "tool", blocks: [{ kind: "toolResult", toolCallId: msg.toolCallId, toolName: msg.toolName, text, isError: msg.isError }] };
  }
  return null;
}

export async function openSession(
  arg: { path: string } | { newIn: string },
  emit: (sessionKey: string, ev: SessionEvent) => void,
): Promise<string> {
  const cwd = "path" in arg ? undefined : arg.newIn;
  const args = "path" in arg ? ["--session", arg.path] : [];
  const client = new RpcClient({ cliPath, cwd, args });
  await client.start();

  const sessionKey = `s${++counter}`;
  pool.set(sessionKey, { client, cwd: cwd ?? "" });

  client.onEvent((ev: AgentEvent) => {
    if (ev.type === "message_update") {
      const d = (ev as any).assistantMessageEvent;
      if (d?.type === "text_delta") emit(sessionKey, { kind: "assistantDelta", text: d.delta });
    } else if (ev.type === "message_end") {
      const m = toBlocks((ev as any).message);
      if (m) emit(sessionKey, { kind: "message", message: m });
    } else if (ev.type === "agent_end") {
      emit(sessionKey, { kind: "idle" });
    }
  });

  // Replay existing history for resumed sessions.
  if ("path" in arg) {
    const msgs = await client.getMessages().catch(() => [] as AgentMessage[]);
    const history = msgs.map(toBlocks).filter((m): m is TranscriptMessage => m !== null);
    emit(sessionKey, { kind: "reset", messages: history });
  } else {
    emit(sessionKey, { kind: "reset", messages: [] });
  }

  return sessionKey;
}

export async function closeSession(sessionKey: string): Promise<void> {
  const e = pool.get(sessionKey);
  if (!e) return;
  pool.delete(sessionKey);
  await e.client.stop().catch(() => {});
}

export async function sendPrompt(sessionKey: string, text: string): Promise<void> {
  const e = pool.get(sessionKey);
  if (!e) throw new Error("unknown session");
  await e.client.prompt(text);
}

export async function getModels(sessionKey: string): Promise<ModelChoice[]> {
  const e = pool.get(sessionKey);
  if (!e) throw new Error("unknown session");
  const models = await e.client.getAvailableModels();
  return models.map((m) => ({ provider: m.provider, id: m.id }));
}

export async function setModel(sessionKey: string, provider: string, id: string): Promise<void> {
  const e = pool.get(sessionKey);
  if (!e) throw new Error("unknown session");
  await e.client.setModel(provider, id);
}
```

- [ ] **Step 4: `src/main/ipc.ts` — wire handlers**

```ts
import { ipcMain, dialog, BrowserWindow } from "electron";
import { listWorkspaces, addWorkspace } from "./workspaces.ts";
import { listSessions, watchSessions } from "./sessions.ts";
import * as rt from "./session-runtime.ts";
import type { FSWatcher } from "node:fs";

export function registerIpc(getWindow: () => BrowserWindow | null): void {
  const emit = (sessionKey: string, ev: unknown) =>
    getWindow()?.webContents.send("session-event", sessionKey, ev);

  const watchers = new Map<string, FSWatcher>();

  ipcMain.handle("listWorkspaces", () => listWorkspaces());

  ipcMain.handle("addWorkspace", async () => {
    const res = await dialog.showOpenDialog({ properties: ["openDirectory"] });
    if (res.canceled || !res.filePaths[0]) return listWorkspaces();
    const path = res.filePaths[0];
    const list = addWorkspace(path);
    if (!watchers.has(path)) {
      const w = watchSessions(path, () => getWindow()?.webContents.send("sessions-changed", path));
      if (w) watchers.set(path, w);
    }
    return list;
  });

  ipcMain.handle("listSessions", (_e, cwd: string) => {
    if (!watchers.has(cwd)) {
      const w = watchSessions(cwd, () => getWindow()?.webContents.send("sessions-changed", cwd));
      if (w) watchers.set(cwd, w);
    }
    return listSessions(cwd);
  });

  ipcMain.handle("openSession", (_e, arg) => rt.openSession(arg, emit).then((sessionKey) => ({ sessionKey })));
  ipcMain.handle("closeSession", (_e, key: string) => rt.closeSession(key));
  ipcMain.handle("sendPrompt", (_e, key: string, text: string) => rt.sendPrompt(key, text));
  ipcMain.handle("getModels", (_e, key: string) => rt.getModels(key));
  ipcMain.handle("setModel", (_e, key: string, provider: string, id: string) => rt.setModel(key, provider, id));
}
```

- [ ] **Step 5: Rewrite `src/main/index.ts` — window + tray + IPC**

```ts
import { app, BrowserWindow, Tray, Menu, nativeImage } from "electron";
import { join } from "node:path";
import { registerIpc } from "./ipc.ts";

let win: BrowserWindow | null = null;
let tray: Tray | null = null;

function createWindow(): void {
  win = new BrowserWindow({
    width: 1280, height: 820, show: true, titleBarStyle: "hiddenInset",
    vibrancy: "sidebar", visualEffectState: "active",
    webPreferences: {
      preload: join(import.meta.dirname, "../preload/index.js"),
      contextIsolation: true, nodeIntegration: false,
    },
  });
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL);
  else win.loadFile(join(import.meta.dirname, "../renderer/index.html"));
  win.on("close", (e) => { e.preventDefault(); win?.hide(); }); // hide, don't destroy
}

function toggleWindow(): void {
  if (!win) return createWindow();
  if (win.isVisible()) win.hide();
  else { win.show(); win.focus(); }
}

function createTray(): void {
  // 1x1 transparent image placeholder; replaced with a real template icon later.
  const icon = nativeImage.createFromDataURL(
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  );
  tray = new Tray(icon);
  tray.setToolTip("pi");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Show/Hide", click: toggleWindow },
    { type: "separator" },
    { label: "Quit", click: () => { app.exit(0); } },
  ]));
  tray.on("click", toggleWindow);
}

app.whenReady().then(() => {
  registerIpc(() => win);
  createWindow();
  createTray();
});
app.on("window-all-closed", () => { /* stay alive in menu bar */ });
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: no errors. (If `@earendil-works/pi-agent-core` types are unresolved, import the message types from `@earendil-works/pi-coding-agent` instead — it re-exports `AgentMessage`/`AgentEvent` via its dist types.)

- [ ] **Step 7: Commit**

```bash
git add src/main && git commit -m "feat: main process — workspaces, sessions, RpcClient pool, IPC, tray"
```

---

## Task 5: Preload bridge

**Files:**
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Expose typed API**

```ts
import { contextBridge, ipcRenderer } from "electron";
import type { Api, SessionEvent } from "../shared/types.ts";

const api: Api = {
  listWorkspaces: () => ipcRenderer.invoke("listWorkspaces"),
  addWorkspace: () => ipcRenderer.invoke("addWorkspace"),
  listSessions: (p) => ipcRenderer.invoke("listSessions", p),
  openSession: (arg) => ipcRenderer.invoke("openSession", arg),
  closeSession: (k) => ipcRenderer.invoke("closeSession", k),
  sendPrompt: (k, t) => ipcRenderer.invoke("sendPrompt", k, t),
  getModels: (k) => ipcRenderer.invoke("getModels", k),
  setModel: (k, p, i) => ipcRenderer.invoke("setModel", k, p, i),
  onSessionEvent: (cb) => {
    const h = (_e: unknown, key: string, ev: SessionEvent) => cb(key, ev);
    ipcRenderer.on("session-event", h);
    return () => ipcRenderer.removeListener("session-event", h);
  },
  onSessionsChanged: (cb) => {
    const h = (_e: unknown, path: string) => cb(path);
    ipcRenderer.on("sessions-changed", h);
    return () => ipcRenderer.removeListener("sessions-changed", h);
  },
};

contextBridge.exposeInMainWorld("pi", api);
```

- [ ] **Step 2: Add renderer global typing** — create `src/renderer/env.d.ts`

```ts
import type { Api } from "../shared/types.ts";
declare global {
  interface Window { pi: Api; }
}
export {};
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/preload src/renderer/env.d.ts
git commit -m "feat: contextBridge preload API"
```

---

## Task 6: Renderer — state hook

**Files:**
- Create: `src/renderer/state/useSessions.ts`

- [ ] **Step 1: Implement session state hook**

```ts
import { useCallback, useEffect, useRef, useState } from "react";
import type { TranscriptMessage, WorkspaceGroup, ModelChoice } from "../../shared/types.ts";

export function useSessions() {
  const [groups, setGroups] = useState<WorkspaceGroup[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [messages, setMessages] = useState<TranscriptMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [models, setModels] = useState<ModelChoice[]>([]);
  const activeKeyRef = useRef<string | null>(null);
  activeKeyRef.current = activeKey;

  const refreshWorkspaces = useCallback(async () => {
    const paths = await window.pi.listWorkspaces();
    const gs = await Promise.all(
      paths.map(async (p) => ({
        path: p,
        name: p.split("/").filter(Boolean).pop() ?? p,
        sessions: await window.pi.listSessions(p),
      })),
    );
    setGroups(gs);
  }, []);

  useEffect(() => { refreshWorkspaces(); }, [refreshWorkspaces]);

  useEffect(() => window.pi.onSessionsChanged(() => refreshWorkspaces()), [refreshWorkspaces]);

  useEffect(() =>
    window.pi.onSessionEvent((key, ev) => {
      if (key !== activeKeyRef.current) return;
      if (ev.kind === "reset") { setMessages(ev.messages); setStreaming(false); }
      else if (ev.kind === "message") setMessages((m) => [...m, ev.message]);
      else if (ev.kind === "assistantDelta") {
        setStreaming(true);
        setMessages((m) => {
          const last = m[m.length - 1];
          if (last?.role === "assistant" && last.blocks[0]?.kind === "text") {
            const copy = m.slice();
            copy[copy.length - 1] = {
              role: "assistant",
              blocks: [{ kind: "text", text: (last.blocks[0].text ?? "") + ev.text }],
            };
            return copy;
          }
          return [...m, { role: "assistant", blocks: [{ kind: "text", text: ev.text }] }];
        });
      } else if (ev.kind === "idle") setStreaming(false);
      else if (ev.kind === "error") setStreaming(false);
    }), []);

  const openSession = useCallback(async (arg: { path: string } | { newIn: string }) => {
    const { sessionKey } = await window.pi.openSession(arg);
    setActiveKey(sessionKey);
    setMessages([]);
    setModels(await window.pi.getModels(sessionKey).catch(() => []));
  }, []);

  const send = useCallback(async (text: string) => {
    if (!activeKey) return;
    setMessages((m) => [...m, { role: "user", blocks: [{ kind: "text", text }] }]);
    await window.pi.sendPrompt(activeKey, text);
  }, [activeKey]);

  const addWorkspace = useCallback(async () => { await window.pi.addWorkspace(); refreshWorkspaces(); }, [refreshWorkspaces]);

  return { groups, activeKey, messages, streaming, models, openSession, send, addWorkspace };
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/state && git commit -m "feat: renderer session state hook"
```

---

## Task 7: Renderer — components + layout

**Files:**
- Create: `src/renderer/components/Sidebar.tsx`, `Transcript.tsx`, `MessageBlocks.tsx`, `InputBar.tsx`
- Modify: `src/renderer/App.tsx` (create), `src/renderer/main.tsx`

- [ ] **Step 1: `MessageBlocks.tsx`**

```tsx
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { TranscriptMessage } from "../../shared/types.ts";

export function MessageBlocks({ msg }: { msg: TranscriptMessage }) {
  return (
    <div className={`msg msg-${msg.role}`}>
      {msg.blocks.map((b, i) => {
        if (b.kind === "text") return <Markdown key={i} remarkPlugins={[remarkGfm]}>{b.text}</Markdown>;
        if (b.kind === "thinking") return <pre key={i} className="thinking">{b.text}</pre>;
        if (b.kind === "toolCall")
          return <details key={i} className="tool"><summary>{b.name}</summary><pre>{JSON.stringify(b.args, null, 2)}</pre></details>;
        return <details key={i} className={`tool ${b.isError ? "tool-error" : ""}`}><summary>{b.toolName} result</summary><pre>{b.text}</pre></details>;
      })}
    </div>
  );
}
```

- [ ] **Step 2: `Transcript.tsx`**

```tsx
import { useEffect, useRef } from "react";
import type { TranscriptMessage } from "../../shared/types.ts";
import { MessageBlocks } from "./MessageBlocks.tsx";

export function Transcript({ messages }: { messages: TranscriptMessage[] }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView({ behavior: "smooth" }), [messages]);
  return (
    <div className="transcript">
      {messages.map((m, i) => <MessageBlocks key={i} msg={m} />)}
      <div ref={end} />
    </div>
  );
}
```

- [ ] **Step 3: `Sidebar.tsx`**

```tsx
import type { WorkspaceGroup } from "../../shared/types.ts";

export function Sidebar({
  groups, onAddWorkspace, onOpen, onNew,
}: {
  groups: WorkspaceGroup[];
  onAddWorkspace: () => void;
  onOpen: (path: string) => void;
  onNew: (cwd: string) => void;
}) {
  return (
    <div className="sidebar">
      <button className="new-agent" onClick={onAddWorkspace}>+ Add workspace</button>
      {groups.map((g) => (
        <div key={g.path} className="ws-group">
          <div className="ws-head">
            <span>{g.name}</span>
            <button className="ws-new" onClick={() => onNew(g.path)}>New Agent</button>
          </div>
          {g.sessions.map((s) => (
            <button key={s.path} className="session-row" onClick={() => onOpen(s.path)}>
              <span className="s-title">{s.title}</span>
              <span className="s-sub">{s.subtitle}</span>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: `InputBar.tsx`**

```tsx
import { useState } from "react";
import type { ModelChoice } from "../../shared/types.ts";

export function InputBar({
  disabled, streaming, models, onSend, onModel,
}: {
  disabled: boolean;
  streaming: boolean;
  models: ModelChoice[];
  onSend: (text: string) => void;
  onModel: (provider: string, id: string) => void;
}) {
  const [text, setText] = useState("");
  const submit = () => { if (text.trim()) { onSend(text.trim()); setText(""); } };
  return (
    <div className="inputbar">
      <textarea
        value={text}
        placeholder={disabled ? "Open or create a session…" : "Send a message…"}
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || !e.shiftKey)) { e.preventDefault(); submit(); } }}
      />
      <div className="inputbar-row">
        <select
          disabled={disabled || models.length === 0}
          onChange={(e) => { const m = models[Number(e.target.value)]; if (m) onModel(m.provider, m.id); }}
        >
          {models.map((m, i) => <option key={`${m.provider}/${m.id}`} value={i}>{m.provider}/{m.id}</option>)}
        </select>
        <button disabled={disabled} onClick={submit}>{streaming ? "…" : "Send"}</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: `App.tsx`**

```tsx
import "./styles/glass.css";
import { useSessions } from "./state/useSessions.ts";
import { Sidebar } from "./components/Sidebar.tsx";
import { Transcript } from "./components/Transcript.tsx";
import { InputBar } from "./components/InputBar.tsx";

export default function App() {
  const s = useSessions();
  return (
    <div className="app">
      <Sidebar
        groups={s.groups}
        onAddWorkspace={s.addWorkspace}
        onOpen={(path) => s.openSession({ path })}
        onNew={(cwd) => s.openSession({ newIn: cwd })}
      />
      <div className="main-pane">
        <Transcript messages={s.messages} />
        <InputBar
          disabled={!s.activeKey}
          streaming={s.streaming}
          models={s.models}
          onSend={s.send}
          onModel={(p, i) => s.activeKey && window.pi.setModel(s.activeKey, p, i)}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Update `src/renderer/main.tsx`**

```tsx
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
createRoot(document.getElementById("root")!).render(<App />);
```

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/renderer && git commit -m "feat: renderer components and layout"
```

---

## Task 8: Glass styling (tokens from Cursor)

**Files:**
- Create: `src/renderer/styles/glass.css`

- [ ] **Step 1: Extract reference tokens**

Run: `grep -oE 'backdrop-filter:[^;]*|border-radius:[^;]*|rgba\([^)]*\)' /Applications/Cursor.app/Contents/Resources/app/out/vs/workbench/workbench.glass.main.css | sort | uniq -c | sort -rn | head -40`
Expected: a frequency-ranked list of blur/radius/rgba values to reuse below.

- [ ] **Step 2: Write `glass.css`** using the observed tokens (blur ~14–18px + saturate, subtle translucent panels). Adjust the values to the most common ones from Step 1.

```css
:root {
  --glass-blur: blur(18px) saturate(1.1);
  --panel: rgba(30, 30, 34, 0.55);
  --panel-2: rgba(40, 40, 46, 0.5);
  --stroke: rgba(255, 255, 255, 0.08);
  --text: rgba(255, 255, 255, 0.92);
  --muted: rgba(255, 255, 255, 0.5);
  --radius: 10px;
  --accent: rgba(120, 150, 255, 0.9);
}
* { box-sizing: border-box; }
html, body, #root { height: 100%; margin: 0; }
body { font: 13px -apple-system, system-ui, sans-serif; color: var(--text); background: transparent; }
.app { display: grid; grid-template-columns: 260px 1fr; height: 100vh; }
.sidebar {
  background: var(--panel); backdrop-filter: var(--glass-blur);
  border-right: 1px solid var(--stroke); overflow-y: auto; padding: 8px;
  padding-top: 36px; /* clears macOS traffic lights (hiddenInset) */
}
.new-agent { width: 100%; padding: 8px; margin-bottom: 8px; border-radius: var(--radius);
  border: 1px solid var(--stroke); background: var(--panel-2); color: var(--text); cursor: pointer; }
.ws-group { margin-bottom: 12px; }
.ws-head { display: flex; justify-content: space-between; align-items: center;
  color: var(--muted); font-size: 11px; text-transform: uppercase; padding: 4px 6px; }
.ws-new { background: none; border: none; color: var(--accent); cursor: pointer; font-size: 11px; }
.session-row { display: flex; flex-direction: column; align-items: flex-start; gap: 2px;
  width: 100%; text-align: left; padding: 8px; border: none; background: none;
  border-radius: 8px; color: var(--text); cursor: pointer; }
.session-row:hover { background: var(--panel-2); }
.s-title { font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
.s-sub { color: var(--muted); font-size: 11px; }
.main-pane { display: grid; grid-template-rows: 1fr auto; height: 100vh; min-width: 0; }
.transcript { overflow-y: auto; padding: 36px 24px 12px; }
.msg { margin: 0 auto 16px; max-width: 760px; }
.msg-user { color: var(--text); background: var(--panel-2); border-radius: var(--radius); padding: 10px 14px; }
.msg-assistant :is(h1,h2,h3) { margin: 0.6em 0 0.3em; }
.msg-assistant table { border-collapse: collapse; }
.msg-assistant :is(th,td) { border: 1px solid var(--stroke); padding: 4px 8px; }
.thinking { color: var(--muted); font-style: italic; white-space: pre-wrap; }
.tool { background: var(--panel-2); border: 1px solid var(--stroke); border-radius: 8px; padding: 6px 10px; margin: 6px 0; }
.tool-error { border-color: rgba(255, 90, 90, 0.5); }
.tool pre { overflow-x: auto; white-space: pre-wrap; }
.inputbar { border-top: 1px solid var(--stroke); background: var(--panel);
  backdrop-filter: var(--glass-blur); padding: 12px; }
.inputbar textarea { width: 100%; min-height: 56px; resize: vertical; border-radius: var(--radius);
  border: 1px solid var(--stroke); background: var(--panel-2); color: var(--text); padding: 10px; font: inherit; }
.inputbar-row { display: flex; justify-content: space-between; margin-top: 8px; }
.inputbar select { background: var(--panel-2); color: var(--text); border: 1px solid var(--stroke);
  border-radius: 8px; padding: 4px 8px; }
.inputbar button { background: var(--accent); color: white; border: none;
  border-radius: 8px; padding: 6px 16px; cursor: pointer; }
.inputbar button:disabled { opacity: 0.5; cursor: default; }
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/styles && git commit -m "style: glass theme with tokens from Cursor reference CSS"
```

---

## Task 9: End-to-end verification

**Files:** none (manual run)

- [ ] **Step 1: Full check**

Run: `npm run typecheck && npm test`
Expected: typecheck clean, tests pass.

- [ ] **Step 2: Manual smoke — add workspace + resume a real session**

Run: `npm run dev`
Then in the app:
1. Click **+ Add workspace**, choose a folder that already has pi sessions (e.g. `/Users/jack/code/racingapi`).
2. Confirm sessions appear in the sidebar, newest first, with titles + relative times.
3. Click a session → its transcript history renders (markdown, tool cards).
4. Type a message, press Enter → assistant text streams in live; tool calls appear as cards; input re-enables when idle.
5. Change the model in the picker → next prompt uses it (no crash).
6. Click **New Agent** under a workspace → empty transcript; send a prompt → new `.jsonl` appears in the sidebar (fs.watch).
7. Close the window (red button) → app stays in menu bar; tray click reopens with state intact.

Expected: all steps pass. Note any failures and fix via systematic-debugging before marking complete.

- [ ] **Step 3: Verify no secrets/keys committed and .gitignore holds**

Run: `git status --porcelain && git ls-files | grep -E 'node_modules|out/' || echo "clean"`
Expected: `clean`.

- [ ] **Step 4: Final commit if any fixes were made**

```bash
git add -A && git commit -m "fix: address issues found in e2e smoke test"
```

---

## Notes for the implementer

- **pi types:** `@earendil-works/pi-coding-agent` re-exports `SessionManager`, `SessionInfo`, `RpcClient`, `ModelInfo`. `AgentEvent`/`AgentMessage` come from `@earendil-works/pi-agent-core` (a transitive dep). If that import path fails to typecheck, fall back to `import type { AgentEvent, AgentMessage } from "@earendil-works/pi-coding-agent"` if re-exported, or `any` at the single `onEvent` boundary (translation is centralized in `toBlocks`, so the blast radius is one file).
- **RpcClient event shape:** documented in the package's `docs/rpc.md`. We only consume `message_update` (text_delta), `message_end`, `agent_end`. Extend `toBlocks`/the event switch if richer streaming (thinking deltas, tool execution progress) is wanted later.
- **Provider/keys:** pi reads provider API keys from its own env/`auth.json`; the app spawns pi as a child so it inherits the environment. No key handling in this app.
- **Deferred:** git panel, terminal, files tree, browser panel, automations, search, thinking-level picker, packaging/signing (separate sub-projects per the spec).
```
