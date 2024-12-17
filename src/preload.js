const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    logIntoTwitch: () => ipcRenderer.send('log-into-twitch'),
    saveState: () => ipcRenderer.send('save-state'),
    resetState: () => ipcRenderer.send('reset-state'),

    receiveLoginStatus: (callback) => {
        ipcRenderer.on('login-status', (event, status) => callback(status));
    },
    onStreamerInfo: (callback) => {
        ipcRenderer.on('streamer-info', (event, data) => callback(data));
    },
    onStateSaved: (callback) => {
        ipcRenderer.on('state-saved', (event, message) => callback(message));
    },
    onStateReset: (callback) => {
        ipcRenderer.on('state-reset', (event, message) => callback(message));
    },
});

