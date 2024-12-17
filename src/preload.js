const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    logIntoTwitch: () => ipcRenderer.send('log-into-twitch'),
    receiveLoginStatus: (callback) => {
        ipcRenderer.on('login-status', (event, status) => callback(status));
    },
    saveState: () => ipcRenderer.send('save-state'),
    resetState: () => ipcRenderer.send('reset-state'),
    onStateSaved: (callback) => ipcRenderer.on('state-saved', (event, message) => callback(message)),
    onStateReset: (callback) => ipcRenderer.on('state-reset', (event, message) => callback(message)),
    startTwitchEventSub: () => ipcRenderer.send('start-twitch-eventsub'),
});
