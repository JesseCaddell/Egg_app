import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import open from 'open'; // Import open at the top for simplicity
import { setupAuthServer as setupTwitchAuth, startTwitchAuth, getAccessToken, getStreamerInfo } from './api/twitch.js';
import { setupStreamlabsAuth, startStreamlabsAuth, connectToStreamlabsSocket } from './api/streamlabs.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow;

// Create a single Express server for both Twitch and Streamlabs
const server = express();
const PORT = 3000;

server.listen(PORT, () => {
    console.log(`Listening for OAuth callbacks on http://localhost:${PORT}`);
});

// Add Twitch routes
setupTwitchAuth(server);

// Add Streamlabs routes
setupStreamlabsAuth(server);

app.on('ready', () => {
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false, // Ensure security
        },
    });

    mainWindow.loadFile(path.join(__dirname, 'overlay/index.html'));
});

// Handle "Log into Twitch" button click
ipcMain.on('log-into-twitch', async () => {
    console.log('Log into Twitch button clicked');

    try {
        // Start Twitch authentication flow
        await startTwitchAuth();

        // Wait for the user to log in, then fetch user info
        setTimeout(async () => {
            const accessToken = getAccessToken();
            if (accessToken) {
                const user = await getStreamerInfo();
                const username = user?.display_name || 'Unknown User';

                // Send login success message to the frontend
                mainWindow.webContents.send('login-status', `Logged in as ${username}`);
            } else {
                mainWindow.webContents.send('login-status', 'Login failed');
            }
        }, 10000); // Allow time for the user to complete login
    } catch (error) {
        console.error('Error during Twitch login:', error.message);
        mainWindow.webContents.send('login-status', 'Login failed');
    }
});

// Handle "Log into Streamlabs" button click
ipcMain.on('log-into-streamlabs', async () => {
    try {
        const authURL = await startStreamlabsAuth();
        console.log('Opening Streamlabs login URL:', authURL);

        // Use the open package directly to open the URL
        await open(authURL);
    } catch (error) {
        console.error('Error during Streamlabs login:', error.message);
    }
});

// Handle "Connect to Streamlabs WebSocket" button click
ipcMain.on('connect-streamlabs-socket', () => {
    const socket = connectToStreamlabsSocket();
    if (socket) {
        console.log('Streamlabs WebSocket connection initialized');
    }
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});