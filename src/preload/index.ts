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
