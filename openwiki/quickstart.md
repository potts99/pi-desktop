# Quickstart for pi-desktop

Welcome to **pi-desktop**, the Electron‑based desktop UI that wraps the `pi` coding agent (a Cursor‑like Agents Window). This guide gets you up and running for development, testing, and production builds.

---

## Prerequisites

- **Node.js** 22 (or later). The app bundles Electron 41+, which requires Node 22.
- **npm** (v10+) – we use the standard npm CLI.
- A valid **`pi` API key** placed in `~/.pi/agent/auth.json` (see the main `README.md` for details).
- macOS 🡪 the instructions are written for macOS; Linux/Windows should work with minor path tweaks.

---

## Install dependencies

```bash
npm install
```

This will install both the production and development dependencies, including the bundled OpenWiki helper.

---

## Development mode

Run the Electron app in hot‑reload mode:

```bash
npm run dev
```

The command starts Vite’s renderer dev server and launches Electron pointing at `process.env.ELECTRON_RENDERER_URL`.  The main process will automatically retry loading the dev URL if the renderer is not ready yet (see `src/main/index.ts`).

You should see a menu‑bar app with a tray icon labelled **pi**. Clicking the tray icon toggles the window.

---

## Running the test suite

```bash
npm test
```

All unit and integration tests are written with **Vitest** and live under the `src/**/*.test.*` files. The test suite exercises the main‑process stores, the IPC layer, and the renderer components.

---

## Type checking

```bash
npm run typecheck
```

We use the TypeScript compiler in `noEmit` mode to validate the project.

---

## Building a production bundle

```bash
npm run build && npm start
```

`npm run build` compiles the renderer with Vite and packages the Electron app using `electron-builder`. The resulting binary can be found in `dist/`.

---

## Common gotchas

1. **Electron version** – The app requires **Electron 41+** (see `README.md`). Older versions crash because `undici` uses `webidl.util.markAsUncloneable` which only exists in Node 22 shipped with Electron 41.
2. **Failed post‑install** – If `npm start` prints `Error: Electron uninstall`, manually extract the cached zip (see the instructions in `README.md`).
3. **API keys** – `pi` reads its keys from `~/.pi/agent/auth.json`. The desktop wrapper does not manage keys; ensure the file exists before launching.

---

## Next steps

- Explore the **architecture** document (`/openwiki/architecture.md`) to understand the main‑process stores, IPC contracts, and the renderer state model.
- Dive into the **renderer components** guide (`/openwiki/renderer.md`) for details on the UI layout, shortcuts, and theming.
- Learn how the **advisor** and **session runtime** work in `/openwiki/backend.md`.

Happy hacking! 🎉
