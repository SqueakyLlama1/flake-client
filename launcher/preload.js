const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('flakeAPI', {
    triggerLaunch: (options) => ipcRenderer.invoke('launch-game', options),
    onProgress: (callback) => ipcRenderer.on('launcher-progress', (event, value) => callback(value)),
    onLog: (callback) => ipcRenderer.on('launcher-log', (event, value) => callback(value)),
    onClosed: (callback) => ipcRenderer.on('launcher-closed', (event, value) => callback(value)),
    onError: (callback) => ipcRenderer.on('launcher-error', (event, value) => callback(value))
});