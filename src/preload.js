const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    logIntoTwitch: () => ipcRenderer.send('log-into-twitch'),
    receiveLoginStatus: (callback) => {
        ipcRenderer.on('login-status', (event, status) => callback(status));
    },
    logIntoStreamlabs: () => ipcRenderer.send('log-into-streamlabs'),
    connectToStreamlabsSocket: () => ipcRenderer.send('connect-streamlabs-socket'),
});
