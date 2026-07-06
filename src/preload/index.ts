import { contextBridge, ipcRenderer } from "electron";
import type { Api, SessionEvent } from "../shared/types.ts";

const api: Api = {
  listWorkspaces: () => ipcRenderer.invoke("listWorkspaces"),
  addWorkspace: () => ipcRenderer.invoke("addWorkspace"),
  removeWorkspace: (path) => ipcRenderer.invoke("removeWorkspace", path),
  listSessions: (p) => ipcRenderer.invoke("listSessions", p),
  listWorkspaceFiles: (cwd, prefix) => ipcRenderer.invoke("listWorkspaceFiles", cwd, prefix),
  openSession: (arg) => ipcRenderer.invoke("openSession", arg),
  closeSession: (k) => ipcRenderer.invoke("closeSession", k),
  sendPrompt: (k, t, mode) => ipcRenderer.invoke("sendPrompt", k, t, mode),
  abortSession: (k) => ipcRenderer.invoke("abortSession", k),
  getModels: (k) => ipcRenderer.invoke("getModels", k),
  getSharedModels: (sessionKey) => ipcRenderer.invoke("getSharedModels", sessionKey),
  setModel: (k, p, i) => ipcRenderer.invoke("setModel", k, p, i),
  getSessionState: (k) => ipcRenderer.invoke("getSessionState", k),
  setMode: (k, mode) => ipcRenderer.invoke("setMode", k, mode),
  setThinkingLevel: (k, level) => ipcRenderer.invoke("setThinkingLevel", k, level),
  cycleThinkingLevel: (k) => ipcRenderer.invoke("cycleThinkingLevel", k),
  forkSession: (k, entryId) => ipcRenderer.invoke("forkSession", k, entryId),
  cloneSession: (k) => ipcRenderer.invoke("cloneSession", k),
  renameSession: (k, name) => ipcRenderer.invoke("renameSession", k, name),
  getSessionStats: (k) => ipcRenderer.invoke("getSessionStats", k),
  getPinned: () => ipcRenderer.invoke("getPinned"),
  togglePin: (path) => ipcRenderer.invoke("togglePin", path),
  getSettings: () => ipcRenderer.invoke("getSettings"),
  getDesktopConfig: () => ipcRenderer.invoke("getDesktopConfig"),
  updateDesktopConfig: (partial) => ipcRenderer.invoke("updateDesktopConfig", partial),
  updateSettings: (partial) => ipcRenderer.invoke("updateSettings", partial),
  deleteSession: (sessionPath) => ipcRenderer.invoke("deleteSession", sessionPath),
  getLastAssistantText: (k) => ipcRenderer.invoke("getLastAssistantText", k),
  closeWindow: () => ipcRenderer.invoke("closeWindow"),
  maximizeWindow: () => ipcRenderer.invoke("maximizeWindow"),
  minimizeWindow: () => ipcRenderer.invoke("minimizeWindow"),
  unmaximizeWindow: () => ipcRenderer.invoke("unmaximizeWindow"),
  isMaximized: () => ipcRenderer.invoke("isMaximized"),
  isFullScreen: () => ipcRenderer.invoke("isFullScreen"),
  openInVSCode: (path) => ipcRenderer.invoke("openInVSCode", path),
  isVSCodeAvailable: () => ipcRenderer.invoke("isVSCodeAvailable"),
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
