import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import { WebSocketServer } from 'ws';
import fs from 'fs';
import { setupAuthServer as setupTwitchAuth, startTwitchAuth, getAccessToken, getStreamerInfo } from './api/twitch.js';
import { startTwitchEventSub } from './api/twitch.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow;

// ---------- Express Server for OAuth and Overlay ----------
const server = express();
const PORT = 3000;

// Serve the overlay HTML
server.get('/overlay', (req, res) => {
    res.sendFile(path.join(__dirname, 'overlay/overlay.html'));
});

// OAuth routes
setupTwitchAuth(server);

// Start the Express server
server.listen(PORT, () => {
    console.log(`Listening for OAuth callbacks and overlay on http://localhost:${PORT}`);
});

// ---------- WebSocket Server for Overlay Communication ----------
const wss = new WebSocketServer({ port: 8080 }); // Corrected initialization
console.log('WebSocket server running on ws://localhost:8080');


// ---------- State Management Helper Functions ----------
const stateFilePath = path.join(__dirname, 'state.json'); // Path to state file
let appState = { currencies: {}, thresholds: {} }; // Default app state

// Save state to file
function saveState() {
    fs.writeFileSync(stateFilePath, JSON.stringify(appState, null, 2), 'utf-8');
    console.log('State saved successfully:', appState);
}

// Load state from file
function loadState() {
    if (fs.existsSync(stateFilePath)) {
        const fileContent = fs.readFileSync(stateFilePath, 'utf-8');
        appState = JSON.parse(fileContent);
        console.log('State loaded:', appState);

        // Broadcast the loaded state to the overlay
        broadcastMessage({
            type: 'state_restored',
            data: appState,
        });
    } else {
        console.log('No state file found. Using default state.');
    }
}

// Reset state to default values
function resetState() {
    appState = { currencies: {}, thresholds: {} }; // Reset to default state
    fs.writeFileSync(stateFilePath, JSON.stringify(appState, null, 2), 'utf-8');
    console.log('State reset to default:', appState);
}



// Broadcast message to all connected clients
function broadcastMessage(message) {
    wss.clients.forEach((client) => {
        if (client.readyState === client.OPEN) {
            client.send(JSON.stringify(message));
        }
    });
}

wss.on('connection', (ws) => {
    console.log('Overlay connected to WebSocket server');
});

// ---------- Twitch EventSub Integration ----------
ipcMain.on('start-twitch-eventsub', () => {
    startTwitchEventSub((event) => {
        console.log('Received Channel Point Redemption:', event);
        // Send the event to the overlay via WebSocket
        broadcastMessage({
            type: 'channel_point_redemption',
            reward: event.reward.title,
            cost: event.reward.cost,
            user: event.user_name,
        });
    });
});

app.on('ready', () => {

    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    mainWindow.loadFile(path.join(__dirname, 'index.html'));
});

// Handle "Log into Twitch" button click
ipcMain.on('log-into-twitch', async () => {
    console.log('Log into Twitch button clicked');

    try {
        // Start Twitch OAuth
        await startTwitchAuth();

        // Wait for the access token to be set
        let attempts = 0;
        const maxAttempts = 10;

        const checkAccessToken = setInterval(async () => {
            const accessToken = getAccessToken();
            if (accessToken) {
                clearInterval(checkAccessToken);

                try {
                    const user = await getStreamerInfo();
                    if (user) {
                        const { name, profileImage } = user;

                        console.log(`Logged in as ${name}`);
                        mainWindow.webContents.send('login-status', `Logged in as ${name}`);

                        // Send the streamer's profile image and name to the frontend
                        mainWindow.webContents.send('streamer-info', {
                            name: name,
                            profileImage: profileImage,
                        });

                        // Load the saved state AFTER successful login
                        loadState();

                        // Start the EventSub WebSocket after successful login
                        mainWindow.webContents.send('start-eventsub');
                    } else {
                        console.error('Failed to fetch user information.');
                        mainWindow.webContents.send('login-status', 'Login failed');
                    }
                } catch (fetchError) {
                    console.error('Error fetching user info:', fetchError.message);
                    mainWindow.webContents.send('login-status', 'Login failed');
                }
            } else if (++attempts >= maxAttempts) {
                clearInterval(checkAccessToken);
                console.error('Failed to retrieve access token.');
                mainWindow.webContents.send('login-status', 'Login failed');
            }
        }, 1000); // Check every 1 second
    } catch (error) {
        console.error('Error during Twitch login:', error.message);
        mainWindow.webContents.send('login-status', 'Login failed');
    }
});


// Handle save state trigger
ipcMain.on('save-state', () => {
    saveState();
    mainWindow.webContents.send('state-saved', 'State saved successfully.');
});

// Handle Reset State event from the frontend
ipcMain.on('reset-state', () => {
    resetState();
    mainWindow.webContents.send('state-reset', 'State has been reset to default.');
});


app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});