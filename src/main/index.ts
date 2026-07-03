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
