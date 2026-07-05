import { app, BrowserWindow, Tray, Menu, nativeImage } from "electron";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { registerIpc } from "./ipc.ts";

// GUI apps launched from Finder/Spotlight don't inherit the shell PATH, so a
// bare `spawn("node", ...)` (the pi agent uses one) fails with ENOENT. Pull the
// real PATH from the login shell so nvm/homebrew node is found. Only needed when
// packaged — a terminal launch (dev/preview) already has the full PATH.
// ponytail: shell PATH probe; if it's ever too slow, cache the result to disk.
function hydratePath(): void {
  if (!app.isPackaged || process.platform === "win32") return;
  try {
    const shell = process.env.SHELL || "/bin/zsh";
    const out = execFileSync(shell, ["-ilc", "echo -n \"$PATH\""], { encoding: "utf8", timeout: 5000 });
    if (out.trim()) process.env.PATH = out.trim();
  } catch { /* keep the inherited PATH */ }
}

let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;

function createWindow(): void {
  win = new BrowserWindow({
    width: 1280, height: 820, show: true, titleBarStyle: "hiddenInset",
    backgroundColor: "#ffffff", // solid, not translucent — matches Cursor
    webPreferences: {
      preload: join(import.meta.dirname, "../preload/index.cjs"),
      contextIsolation: true, nodeIntegration: false,
    },
  });
  // Mirror renderer console + load failures to the terminal for debugging.
  win.webContents.on("console-message", (_e, level, message, line, source) => {
    console.log(`[renderer:${level}] ${message} (${source}:${line})`);
  });
  win.webContents.on("did-fail-load", (_e, code, desc, url) => {
    console.log(`[renderer] did-fail-load ${code} ${desc} ${url}`);
    // Dev startup race: Electron can call loadURL before Vite is listening (or
    // after the dev server restarts), leaving a permanently blank window since
    // nothing reloads it. Retry the dev URL until it comes up.
    const devUrl = process.env.ELECTRON_RENDERER_URL;
    if (devUrl && code !== -3 && !win?.isDestroyed()) {
      setTimeout(() => { if (!win?.isDestroyed()) void win?.loadURL(devUrl); }, 500);
    }
  });
  win.webContents.on("render-process-gone", (_e, details) => {
    console.log(`[renderer] process gone: ${details.reason}`);
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    win.loadFile(join(import.meta.dirname, "../renderer/index.html"));
  }
  win.on("close", (e) => {
    if (isQuitting) return;
    e.preventDefault();
    win?.hide();
  }); // hide, don't destroy unless the app is quitting
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
  hydratePath();
  registerIpc(() => win);
  createWindow();
  createTray();
});
app.on("before-quit", () => { isQuitting = true; });
app.on("window-all-closed", () => { /* stay alive in menu bar */ });
