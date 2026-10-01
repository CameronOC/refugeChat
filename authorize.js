// One-time: obtain a Twitch refresh_token so the bot can mint its own tokens.
//
// Run once:  node authorize.js
// Needs TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET in .env, and the app's
// OAuth Redirect URL at dev.twitch.tv/console set to the REDIRECT below.
//
// After this, token.js refreshes indefinitely without manual steps.
const http = require('http');
const fs = require('fs');
const path = require('path');

// For a manual run:  set -a; source .env; set +a; node authorize.js
const ID = process.env.TWITCH_CLIENT_ID;
const SECRET = process.env.TWITCH_CLIENT_SECRET;
const REDIRECT = process.env.TWITCH_REDIRECT || 'http://localhost:3000/callback';
const SCOPES = ['chat:read', 'chat:edit'];

if (!ID || !SECRET) {
  console.error('Set TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET first (see .env).');
  process.exit(1);
}

const authUrl = 'https://id.twitch.tv/oauth2/authorize?' + new URLSearchParams({
  client_id: ID, redirect_uri: REDIRECT, response_type: 'code', scope: SCOPES.join(' ')
});

console.log('\nOpen this in a browser and approve:\n\n  ' + authUrl + '\n');

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, REDIRECT);
  const code = url.searchParams.get('code');
  if (!code) { res.writeHead(400).end('no code'); return; }
  try {
    const body = new URLSearchParams({
      client_id: ID, client_secret: SECRET, code,
      grant_type: 'authorization_code', redirect_uri: REDIRECT
    });
    const r = await fetch('https://id.twitch.tv/oauth2/token', { method: 'POST', body });
    const d = await r.json();
    if (!d.refresh_token) throw new Error(JSON.stringify(d));
    fs.writeFileSync(path.join(__dirname, '.token-cache.json'), JSON.stringify({
      access_token: d.access_token,
      refresh_token: d.refresh_token,
      expires_at: Date.now() + (d.expires_in || 14400) * 1000
    }, null, 2), { mode: 0o600 });
    console.log('\nSaved .token-cache.json. Also add this line to .env so a cache wipe recovers:\n');
    console.log('  TWITCH_REFRESH_TOKEN=' + d.refresh_token + '\n');
    res.end('refugeChat authorized - you can close this tab.');
  } catch (e) {
    console.error('exchange failed:', e.message);
    res.writeHead(500).end('failed');
  } finally {
    setTimeout(() => server.close(() => process.exit(0)), 500);
  }
});
server.listen(new URL(REDIRECT).port || 3000);
