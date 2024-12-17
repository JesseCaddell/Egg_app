import axios from 'axios';
import dotenv from 'dotenv';
import open from 'open';
import WebSocket from 'ws';
import express from 'express';

dotenv.config();

const CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const REDIRECT_URI = process.env.TWITCH_REDIRECT_URI;
const WEBSOCKET_URL = 'wss://eventsub.wss.twitch.tv/ws';

let accessToken;

// ------------------ Twitch OAuth Flow ------------------
export async function startTwitchAuth() {
    const authURL = `https://id.twitch.tv/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(
        REDIRECT_URI
    )}&response_type=code&scope=channel:manage:redemptions`;

    console.log(`Opening Twitch login URL: ${authURL}`);
    await open(authURL);
}

export async function handleAuthCallback(req, res) {
    const authCode = req.query.code; // Retrieve the "code" from the query string
    if (!authCode) {
        console.error('Authorization code not received');
        res.status(400).send('<h1>Error: Authorization code not received</h1>');
        return;
    }

    console.log(`Received auth code: ${authCode}`);

    try {
        // Exchange the auth code for an access token
        const response = await axios.post(
            `https://id.twitch.tv/oauth2/token`,
            null,
            {
                params: {
                    client_id: CLIENT_ID,
                    client_secret: CLIENT_SECRET,
                    code: authCode,
                    grant_type: 'authorization_code',
                    redirect_uri: REDIRECT_URI,
                },
            }
        );

        accessToken = response.data.access_token;
        console.log('Access Token:', accessToken);

        res.send('<h1>Authentication successful! You can close this tab.</h1>');
    } catch (error) {
        console.error('Error exchanging auth code for token:', error.message);
        res.status(500).send('<h1>Error: Unable to authenticate with Twitch</h1>');
    }
}

export function setupAuthServer(app) {
    app.get('/auth/callback', handleAuthCallback);
    console.log('Twitch OAuth callback route set up');
}

export async function getStreamerInfo() {
    try {
        const response = await axios.get('https://api.twitch.tv/helix/users', {
            headers: {
                'Client-ID': CLIENT_ID,
                Authorization: `Bearer ${accessToken}`,
            },
        });

        const user = response.data.data[0];
        console.log('Logged-in User:', user.display_name);
        console.log('Broadcaster ID:', user.id);
        console.log('Profile Image URL:', user.profile_image_url); // Add this log

        return {
            name: user.display_name,
            id: user.id,
            profileImage: user.profile_image_url,
        };
    } catch (error) {
        console.error('Error fetching streamer info:', error.message);
    }
}

export function getAccessToken() {
    return accessToken;
}

// ------------------ Twitch EventSub WebSocket Integration ------------------
export function startTwitchEventSub(onRedemptionEvent) {
    if (!accessToken) {
        console.error('Access token not available. Authenticate with Twitch first.');
        return;
    }

    let ws;
    ws = new WebSocket(WEBSOCKET_URL);

    ws.on('open', () => {
        console.log('Connected to Twitch EventSub WebSocket');
    });

    ws.on('message', (data) => {
        const message = JSON.parse(data);
        if (message.metadata?.message_type === 'session_welcome') {
            console.log('Session connected. Subscribing to events...');
            subscribeToChannelPointRedemptions(message.payload.session.id);
        } else if (message.metadata?.message_type === 'notification') {
            console.log('Event Notification Received:', message.payload.event);
            onRedemptionEvent(message.payload.event); // Send the event to the callback
        } else if (message.metadata?.message_type === 'session_keepalive') {
            console.log('Session keepalive received.');
        }
    });

    ws.on('close', (code, reason) => {
        console.log(`WebSocket closed. Code: ${code}, Reason: ${reason}`);
        reconnectWebSocket();
    });

    ws.on('error', (error) => {
        console.error('WebSocket Error:', error.message);
        reconnectWebSocket();
    });
}

function reconnectWebSocket() {
    console.log('Reconnecting to WebSocket in 5 seconds...');
    setTimeout(() => startTwitchEventSub(), 5000);
}

async function subscribeToChannelPointRedemptions(sessionId) {
    try {
        const user = await getStreamerInfo();
        if (!user || !user.id) {
            console.error('Failed to fetch broadcaster user ID.');
            return;
        }

        const response = await axios.post(
            'https://api.twitch.tv/helix/eventsub/subscriptions',
            {
                type: 'channel.channel_points_custom_reward_redemption.add',
                version: '1',
                condition: {
                    broadcaster_user_id: user.id, // Use dynamically fetched user ID
                },
                transport: {
                    method: 'websocket',
                    session_id: sessionId,
                },
            },
            {
                headers: {
                    'Client-ID': CLIENT_ID,
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
            }
        );

        console.log('Successfully subscribed to Channel Point Redemptions:', response.data);
    } catch (error) {
        console.error('Error subscribing to Channel Point Redemptions:', error.response?.data || error.message);
    }
}
