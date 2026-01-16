const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  extractUnits: () => ipcRenderer.invoke('extract-units'),
  selectUnits: (units) => ipcRenderer.invoke('select-units', units),
  executeScript: () => ipcRenderer.invoke('execute-script'),
  getStatus: () => ipcRenderer.invoke('get-status'),
  clearLogs: () => ipcRenderer.invoke('clear-logs'),
  
  // Listeners para atualizações em tempo real
  onLogUpdate: (callback) => ipcRenderer.on('log-update', (event, logs) => callback(logs)),
  onExecutionComplete: (callback) => ipcRenderer.on('execution-complete', (event, data) => callback(data))
});
