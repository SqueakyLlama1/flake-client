const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('flakeAPI', {
    triggerLaunch: (options) => ipcRenderer.invoke('launch-game', options),
    getLatestAccount: () => ipcRenderer.invoke('get-latest-account'),
    switchAccount: (uuid) => ipcRenderer.invoke('switch-account', uuid),
    getAccounts: () => ipcRenderer.invoke('request-account-list'),
    triggerLogin: () => ipcRenderer.invoke('trigger-login'),
    signOut: (uuid) => ipcRenderer.invoke('sign-out', uuid),
    openLogs: () => ipcRenderer.invoke('open-logs'),
    requestSkin: (uuid, force, part = 'all') => ipcRenderer.invoke('request-skin', uuid, force, part),
    checkAuthServers: () => ipcRenderer.invoke('check-auth-servers'),
    getActiveAccount: () => ipcRenderer.invoke('get-active-account'),

    onAccountInfo: (callback) => ipcRenderer.on('account-info', (event, value) => callback(value)),
    onProgress: (callback) => ipcRenderer.on('launcher-progress', (event, value) => callback(value)),
    onLog: (callback) => ipcRenderer.on('launcher-log', (event, value) => callback(value)),
    onClosed: (callback) => ipcRenderer.on('launcher-closed', (event, value) => callback(value)),
    onError: (callback) => ipcRenderer.on('launcher-error', (event, value) => callback(value)),
    onPromptRequest: (callback) => ipcRenderer.on('trigger-login-prompt', (event, value) => callback(value))
});