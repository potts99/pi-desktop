import { contextBridge, ipcRenderer } from "electron";
import type { Api, SessionEvent } from "../shared/types.ts";

const api: Api = {
  listWorkspaces: () => ipcRenderer.invoke("listWorkspaces"),
  addWorkspace: () => ipcRenderer.invoke("addWorkspace"),
  listSessions: (p) => ipcRenderer.invoke("listSessions", p),
  openSession: (arg) => ipcRenderer.invoke("openSession", arg),
  closeSession: (k) => ipcRenderer.invoke("closeSession", k),
  sendPrompt: (k, t, mode) => ipcRenderer.invoke("sendPrompt", k, t, mode),
  abortSession: (k) => ipcRenderer.invoke("abortSession", k),
  getModels: (k) => ipcRenderer.invoke("getModels", k),
  setModel: (k, p, i) => ipcRenderer.invoke("setModel", k, p, i),
  getSessionState: (k) => ipcRenderer.invoke("getSessionState", k),
  setThinkingLevel: (k, level) => ipcRenderer.invoke("setThinkingLevel", k, level),
  cycleThinkingLevel: (k) => ipcRenderer.invoke("cycleThinkingLevel", k),
  forkSession: (k, entryId) => ipcRenderer.invoke("forkSession", k, entryId),
  cloneSession: (k) => ipcRenderer.invoke("cloneSession", k),
  renameSession: (k, name) => ipcRenderer.invoke("renameSession", k, name),
  deleteSession: (sessionPath) => ipcRenderer.invoke("deleteSession", sessionPath),
  getLastAssistantText: (k) => ipcRenderer.invoke("getLastAssistantText", k),
  closeWindow: () => ipcRenderer.invoke("closeWindow"),
  maximizeWindow: () => ipcRenderer.invoke("maximizeWindow"),
  minimizeWindow: () => ipcRenderer.invoke("minimizeWindow"),
  unmaximizeWindow: () => ipcRenderer.invoke("unmaximizeWindow"),
  isMaximized: () => ipcRenderer.invoke("isMaximized"),
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
