// Twitch live-status check.
//
// The bot must stay silent while the channel is offline, so every outbound
// chat line goes through isLive() first. Helix is polled at most once per
// TTL_MS per channel and the answer cached - otherwise a busy chat would hit
// the API on every single message.
const { getAccessToken } = require('./token.js');

const TTL_MS = (Number(process.env.LIVE_TTL_SEC) || 60) * 1000;

// channel (lowercase, no '#') -> { live: boolean|null, at: epoch ms }
const cache = new Map();

async function fetchLive (channel) {
  const id = process.env.TWITCH_CLIENT_ID;
  if (!id) throw new Error('TWITCH_CLIENT_ID is not set');
  // Helix accepts the same user token the bot chats with; no extra scope is
  // needed to read a public stream's status.
  const token = await getAccessToken();
  const url = `https://api.twitch.tv/helix/streams?user_login=${encodeURIComponent(channel)}`;
  const res = await fetch(url, {
    headers: { 'Client-Id': id, Authorization: `Bearer ${token}` }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`helix streams failed (${res.status}): ${data.message || JSON.stringify(data)}`);
  }
  // An offline channel returns an empty data array.
  return Array.isArray(data.data) && data.data.some(s => s.type === 'live');
}

function key (channel) {
  return String(channel).replace(/^#/, '').toLowerCase();
}

// Fails closed: with no usable answer at all the bot stays quiet rather than
// announcing into an offline channel. A transient error keeps the last known
// state, so one failed poll does not mute a stream that is actually live.
async function isLive (channel) {
  // Escape hatch for local testing against a channel that is never live.
  if (process.env.LIVE_CHECK === 'off') return true;

  const name = key(channel);
  const hit = cache.get(name);
  if (hit && hit.live !== null && Date.now() - hit.at < TTL_MS) return hit.live;

  const was = hit ? hit.live : null;
  try {
    const live = await fetchLive(name);
    if (live !== was) console.log(`[live] ${name} is ${live ? 'LIVE' : 'offline'}`);
    cache.set(name, { live, at: Date.now() });
    return live;
  } catch (e) {
    const assumed = was === true;
    // Stamp the failure so a broken API is not re-queried on every message.
    cache.set(name, { live: assumed, at: Date.now() });
    console.log(`[live] check failed for ${name}, assuming ${assumed ? 'live' : 'offline'}: ${e.message}`);
    return assumed;
  }
}

module.exports = { isLive, _cache: cache };
