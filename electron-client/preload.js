const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  onConfig: (cb) => ipcRenderer.on("config", (_, data) => cb(data))
});
