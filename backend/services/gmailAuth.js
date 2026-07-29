const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { google } = require('googleapis');

const CREDENTIALS_PATH = path.join(__dirname, '..', 'gmail_credentials.json');
const TOKEN_PATH = path.join(__dirname, '..', 'gmail_token.json');
const SCOPES = ['https://www.googleapis.com/auth/gmail.modify'];

function loadCredentials() {
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    throw new Error(`Missing Gmail credentials at ${CREDENTIALS_PATH}`);
  }

  const raw = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
  const credentials = raw.installed || raw.web;
  if (!credentials) {
    throw new Error('gmail_credentials.json must contain an "installed" or "web" client');
  }

  return credentials;
}

function createOAuthClient(credentials) {
  const redirectUri = credentials.redirect_uris?.[0] || 'http://localhost';
  return new google.auth.OAuth2(
    credentials.client_id,
    credentials.client_secret,
    redirectUri,
  );
}

function saveToken(token) {
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(token, null, 2));
  console.log('[gmailAuth] Token saved to', TOKEN_PATH);
}

function askForAuthCode(authUrl) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log('\nAuthorize this app by visiting this URL:\n');
  console.log(authUrl);
  console.log('\n');

  return new Promise((resolve) => {
    rl.question('Paste the authorization code here: ', (code) => {
      rl.close();
      resolve(code.trim());
    });
  });
}

async function authorizeWithCode(oAuth2Client) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
  });

  const code = await askForAuthCode(authUrl);
  const { tokens } = await oAuth2Client.getToken(code);
  oAuth2Client.setCredentials(tokens);
  saveToken(tokens);
  return oAuth2Client;
}

/**
 * Returns an authenticated Google OAuth2 client for Gmail API access.
 * Uses an existing token when present; otherwise runs the one-time auth flow.
 */
async function getAuthClient() {
  const credentials = loadCredentials();
  const oAuth2Client = createOAuthClient(credentials);

  oAuth2Client.on('tokens', (tokens) => {
    try {
      const existing = fs.existsSync(TOKEN_PATH)
        ? JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'))
        : {};
      saveToken({ ...existing, ...tokens });
    } catch (error) {
      console.error('[gmailAuth] Failed to persist refreshed token:', error.message);
    }
  });

  if (fs.existsSync(TOKEN_PATH)) {
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
    oAuth2Client.setCredentials(token);
    console.log('[gmailAuth] Loaded existing token from', TOKEN_PATH);
    return oAuth2Client;
  }

  console.log('[gmailAuth] No token found — starting OAuth authorization flow');
  return authorizeWithCode(oAuth2Client);
}

module.exports = { getAuthClient };
