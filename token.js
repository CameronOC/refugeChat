// Twitch token management.
//
// Chat requires a USER access token, so client-credentials will not work.
// The authorization-code flow gives a refresh_token once; from then on the
// app mints its own access tokens and never needs manual intervention.
//
// Access tokens last ~4 hours. This refreshes on startup and whenever the
// cached one is within 10 minutes of expiry, caching to .token-cache.json
// (gitignored) so restarts do not burn a refresh unnecessarily.
const fs = require('fs');
const path = require('path');

const CACHE = path.join(__dirname, '.token-cache.json');
const SKEW_MS = 10 * 60 * 1000;

function readCache() {
  try { return JSON.parse(fs.readFileSync(CACHE, 'utf8')); } catch { return null; }
}

function writeCache(obj) {
  fs.writeFileSync(CACHE, JSON.stringify(obj, null, 2), { mode: 0o600 });
}

async function refresh() {
  const id = process.env.TWITCH_CLIENT_ID;
  const secret = process.env.TWITCH_CLIENT_SECRET;
  const refreshToken = process.env.TWITCH_REFRESH_TOKEN || (readCache() || {}).refresh_token;
  if (!id || !secret || !refreshToken) {
    throw new Error('need TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET and TWITCH_REFRESH_TOKEN ' +
                    '(run `node authorize.js` once to obtain the refresh token)');
  }
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: id,
    client_secret: secret
  });
  const res = await fetch('https://id.twitch.tv/oauth2/token', { method: 'POST', body });
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(`token refresh failed (${res.status}): ${data.message || JSON.stringify(data)}`);
  }
  const rec = {
    access_token: data.access_token,
    // Twitch may rotate the refresh token; always keep the newest one
    refresh_token: data.refresh_token || refreshToken,
    expires_at: Date.now() + (data.expires_in || 14400) * 1000
  };
  writeCache(rec);
  console.log(`[token] refreshed, valid for ${Math.round((data.expires_in || 0) / 60)} min`);
  return rec.access_token;
}

async function getAccessToken() {
  // A manually-supplied token still works; it just will not auto-renew.
  if (process.env.TWITCH_OAUTH) return process.env.TWITCH_OAUTH.replace(/^oauth:/, '');
  const c = readCache();
  if (c && c.access_token && c.expires_at - Date.now() > SKEW_MS) return c.access_token;
  return refresh();
}

module.exports = { getAccessToken, refresh };
