import axios from 'axios';
import dotenv from 'dotenv';
import open from 'open';
import express from 'express';

dotenv.config();

const CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const REDIRECT_URI = process.env.TWITCH_REDIRECT_URI;

let accessToken;

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
        return user;
    } catch (error) {
        console.error('Error fetching streamer info:', error.message);
    }
}

export function getAccessToken() {
    return accessToken;
}
