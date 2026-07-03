import { app, BrowserWindow, Tray, Menu, nativeImage } from "electron";
import { join } from "node:path";
import { registerIpc } from "./ipc.ts";

let win: BrowserWindow | null = null;
let tray: Tray | null = null;

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
