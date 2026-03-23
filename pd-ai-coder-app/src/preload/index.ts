import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("api", {
  sendMessage: (text: string) => ipcRenderer.invoke("chat:send", text),
  resetSession: () => ipcRenderer.invoke("chat:reset"),
  getStatus: () => ipcRenderer.invoke("status:get"),
  checkAuth: () => ipcRenderer.invoke("auth:check"),
  login: () => ipcRenderer.invoke("auth:login"),
  loadPatch: () => ipcRenderer.invoke("patch:load"),
});
