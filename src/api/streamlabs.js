import axios from 'axios';
import WebSocket from 'ws';
import dotenv from 'dotenv';

export function setupStreamlabsAuth(app) {
    app.get('/streamlabs/callback', handleStreamlabsCallback);
    console.log('Streamlabs OAuth callback route set up');
}

dotenv.config();

const CLIENT_ID = process.env.STREAMLABS_CLIENT_ID;
const CLIENT_SECRET = process.env.STREAMLABS_CLIENT_SECRET;
const REDIRECT_URI = process.env.STREAMLABS_REDIRECT_URI;

let accessToken;
let socketToken;

// Generate the Streamlabs login URL
export async function startStreamlabsAuth() {
    const authURL = `https://streamlabs.com/api/v2.0/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(
        REDIRECT_URI
    )}&response_type=code&scope=socket.token+alerts.create`;

    console.log(`Generated Streamlabs Auth URL: ${authURL}`);
    return authURL;
}

// Handle the OAuth callback
export async function handleStreamlabsCallback(req, res) {
    const authCode = req.query.code; // Get the authorization code from the callback
    if (!authCode) {
        console.error('Streamlabs authorization code not received');
        res.status(400).send('<h1>Error: Authorization code not received</h1>');
        return;
    }

    try {
        // Exchange the authorization code for an access token
        const response = await axios.post('https://streamlabs.com/api/v2.0/token', {
            grant_type: 'authorization_code',
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            redirect_uri: REDIRECT_URI,
            code: authCode,
        }, {
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
            },
        });

        // Extract the access token
        accessToken = response.data.access_token;
        console.log('Streamlabs Access Token:', accessToken);

        // Fetch the WebSocket token using the access token
        const socketResponse = await axios.get('https://streamlabs.com/api/v2.0/socket/token', {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });

        socketToken = socketResponse.data.socket_token;
        console.log('Streamlabs Socket Token:', socketToken);

        // Respond to the user indicating success
        res.send('<h1>Streamlabs authentication successful! You can close this tab.</h1>');
    } catch (error) {
        console.error('Error during Streamlabs authentication:', error.response?.data || error.message);
        res.status(500).send('<h1>Error: Unable to authenticate with Streamlabs</h1>');
    }
}

// Connect to the Streamlabs WebSocket
export function connectToStreamlabsSocket() {
    if (!socketToken) {
        console.error('Socket token is not available. Authenticate with Streamlabs first.');
        return;
    }

    const socket = new WebSocket(`wss://sockets.streamlabs.com?token=${socketToken}`);

    socket.on('open', () => {
        console.log('Connected to Streamlabs WebSocket');
    });

    socket.on('message', (data) => {
        const message = JSON.parse(data);
        console.log('Streamlabs Event:', message);
    });

    socket.on('close', () => {
        console.log('Streamlabs WebSocket connection closed');
    });

    socket.on('error', (error) => {
        console.error('Streamlabs WebSocket error:', error);
    });

    return socket;
}
