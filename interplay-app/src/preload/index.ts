import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("api", {
  sendMessage: (text: string) => ipcRenderer.invoke("chat:send", text),
  cancelMessage: () => ipcRenderer.invoke("chat:cancel"),
  resetSession: () => ipcRenderer.invoke("chat:reset"),
  getStatus: () => ipcRenderer.invoke("status:get"),
  checkAuth: () => ipcRenderer.invoke("auth:check"),
  login: () => ipcRenderer.invoke("auth:login"),
  loadPatch: () => ipcRenderer.invoke("patch:load"),
  // p5.js Editor
  p5GetCode: () => ipcRenderer.invoke("p5:getCode"),
  p5SaveCode: (code: string) => ipcRenderer.invoke("p5:saveCode", code),
  // SerialOSC
  serialList: () => ipcRenderer.invoke("serial:list"),
  serialConnect: (portPath: string) => ipcRenderer.invoke("serial:connect", portPath),
  serialDisconnect: () => ipcRenderer.invoke("serial:disconnect"),
  serialStatus: () => ipcRenderer.invoke("serial:status"),
  serialSetDest: (host: string, port: number) => ipcRenderer.invoke("serial:setDest", host, port),
});
