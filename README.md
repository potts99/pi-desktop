# pi-desktop

A Cursor "Agents Window" clone (sidebar of agent sessions grouped by
workspace, chat transcript, model picker), backed by the
[pi](https://github.com/earendil-works/pi) coding agent instead of Cursor's
own agent. Menu-bar app; the tray icon toggles the window.

See `docs/superpowers/specs/` and `docs/superpowers/plans/` for the design
and build plan. This is sub-project 1 (core shell); git/terminal/files/
browser panels and automations are planned follow-ups.

## Develop

```bash
npm install
npm run dev        # electron-vite dev
npm test           # vitest
npm run typecheck
npm run build && npm start   # run the built app
```

## Requirements / gotchas

- **Electron 41+ is required** (not 32). pi's bundled `undici` calls
  `webidl.util.markAsUncloneable`, which needs the Node 22 that Electron 41
  ships; Electron 32's Node 20 crashes on load.
- **If `npm start` reports `Error: Electron uninstall`**, Electron's
  postinstall failed to unpack its binary (its `extract-zip` step can choke
  on the macOS `.app` bundle). Fix by extracting the cached zip with
  `ditto` and pointing `path.txt` at it:

  ```bash
  ZIP=$(ls ~/Library/Caches/electron/*/electron-v41.*-darwin-arm64.zip | head -1)
  rm -rf node_modules/electron/dist && mkdir node_modules/electron/dist
  ditto -x -k "$ZIP" node_modules/electron/dist
  printf 'Electron.app/Contents/MacOS/Electron' > node_modules/electron/path.txt
  ```

- pi reads provider API keys from its own env / `~/.pi/agent/auth.json`; the
  app spawns pi as a child process so it inherits your environment. No key
  handling lives in this app.
