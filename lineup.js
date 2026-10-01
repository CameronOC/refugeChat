// Lineup source: Discord guild scheduled events, with set.json as a fallback.
//
// Each scheduled event becomes one slot: the event name is the DJ, and the
// start/end times give the window. Events are cached briefly so a room full of
// people spamming !set cannot rate-limit us against Discord.
//
// If Discord is unconfigured or unreachable we fall back to set.json rather
// than failing the command - a stale lineup beats no lineup in chat.
const API = 'https://discord.com/api/v10';
const TTL_MS = Number(process.env.LINEUP_TTL_SEC || 300) * 1000;
const MAX_SLOTS = 12;

// Discord guild_scheduled_event.status
const CANCELED = 4;
const COMPLETED = 3;

let cache = { at: 0, slots: null, source: null };

function localMidnight(d = new Date()) {
  const m = new Date(d);
  m.setHours(0, 0, 0, 0);
  return m;
}

// set.json is wall-clock only ("15:00"), so anchor it to today.
function fromSetJson() {
  let set;
  try { set = require('./set.json'); } catch { return []; }
  if (!Array.isArray(set)) return [];
  const base = localMidnight().getTime();
  return set.map(s => {
    const [h, m] = String(s.start).split(':').map(Number);
    const start = new Date(base + (h * 60 + m) * 60000);
    return { start, end: new Date(start.getTime() + (s.mins || 90) * 60000), dj: s.dj };
  });
}

async function fromDiscord() {
  const token = process.env.DISCORD_TOKEN;
  const guild = process.env.DISCORD_GUILD_ID;
  if (!token || !guild) return null;

  const res = await fetch(`${API}/guilds/${guild}/scheduled-events`, {
    headers: { Authorization: `Bot ${token}` }
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`discord ${res.status}: ${body.slice(0, 200)}`);
  }
  const events = await res.json();
  if (!Array.isArray(events)) throw new Error('unexpected discord payload');

  const slots = events
    .filter(e => e.status !== CANCELED && e.status !== COMPLETED)
    .filter(e => e.scheduled_start_time)
    .map(e => ({
      start: new Date(e.scheduled_start_time),
      end: e.scheduled_end_time ? new Date(e.scheduled_end_time) : null,
      dj: (e.name || '').trim()
    }))
    .filter(s => s.dj && !isNaN(s.start))
    .sort((a, b) => a.start - b.start);

  // Discord allows a null end time. Infer it from the next slot's start, and
  // fall back to 90 minutes for the last one.
  for (let i = 0; i < slots.length; i++) {
    if (!slots[i].end || isNaN(slots[i].end)) {
      const next = slots[i + 1];
      slots[i].end = next ? new Date(next.start) : new Date(slots[i].start.getTime() + 90 * 60000);
    }
  }
  return slots;
}

// Currently-running plus upcoming, so a lineup running past midnight still
// reads correctly instead of being cut off by a calendar-day filter.
function futureOnly(slots) {
  const now = Date.now();
  return slots.filter(s => s.end.getTime() > now).slice(0, MAX_SLOTS);
}

async function getLineup() {
  if (cache.slots && Date.now() - cache.at < TTL_MS) return cache;

  let slots = null;
  let source = 'set.json';
  try {
    slots = await fromDiscord();
    if (slots) source = 'discord';
  } catch (e) {
    console.log(`[lineup] discord fetch failed, falling back to set.json: ${e.message}`);
    slots = null;
  }
  if (!slots) slots = fromSetJson();

  cache = { at: Date.now(), slots, source };
  return cache;
}

module.exports = { getLineup, futureOnly, fromSetJson };
