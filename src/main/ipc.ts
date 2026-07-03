import { ipcMain, dialog, BrowserWindow } from "electron";
import type { FSWatcher } from "node:fs";
import { listWorkspaces, addWorkspace } from "./workspaces.ts";
import { listSessions, sessionDirFor, watchDir } from "./sessions.ts";
import * as rt from "./session-runtime.ts";

export function registerIpc(getWindow: () => BrowserWindow | null): void {
  const emit = (sessionKey: string, ev: unknown) =>
    getWindow()?.webContents.send("session-event", sessionKey, ev);

  const watchers = new Map<string, FSWatcher>();

  // Lazily attach a filesystem watcher for a workspace's session dir so
  // externally-created sessions refresh the sidebar. No-op if already watching
  // or the dir doesn't exist yet.
  async function ensureWatch(cwd: string): Promise<void> {
    if (watchers.has(cwd)) return;
    const dir = await sessionDirFor(cwd);
    if (!dir) return;
    const w = watchDir(dir, () => getWindow()?.webContents.send("sessions-changed", cwd));
    if (w) watchers.set(cwd, w);
  }

  ipcMain.handle("listWorkspaces", () => listWorkspaces());

  ipcMain.handle("addWorkspace", async () => {
    const res = await dialog.showOpenDialog({ properties: ["openDirectory"] });
    if (res.canceled || !res.filePaths[0]) return listWorkspaces();
    const path = res.filePaths[0];
    const list = addWorkspace(path);
    await ensureWatch(path);
    return list;
  });

  ipcMain.handle("listSessions", async (_e, cwd: string) => {
    await ensureWatch(cwd);
    return listSessions(cwd);
  });

  ipcMain.handle("openSession", (_e, arg) => rt.openSession(arg, emit));
  ipcMain.handle("closeSession", (_e, key: string) => rt.closeSession(key));
  ipcMain.handle("sendPrompt", (_e, key: string, text: string) => rt.sendPrompt(key, text));
  ipcMain.handle("getModels", (_e, key: string) => rt.getModels(key));
  ipcMain.handle("setModel", (_e, key: string, provider: string, id: string) => rt.setModel(key, provider, id));
}
