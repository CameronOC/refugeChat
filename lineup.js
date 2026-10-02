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

// set.json is wall-clock only ("15:00"), so it has to be anchored to a date.
//
// Anchor to yesterday as well as today: a set that starts at 23:00 runs past
// midnight, and once the date rolls, today's anchoring puts it 24h in the
// future - so a set still playing at 00:10 would read as "no set". The
// yesterday-anchored copy covers that tail. Expired slots are dropped by
// futureOnly, so the extra copies are invisible outside the overlap.
function fromSetJson() {
  let set;
  try { set = require('./set.json'); } catch { return []; }
  if (!Array.isArray(set)) return [];
  const today = localMidnight().getTime();
  const DAY = 86400000;
  const out = [];
  for (const base of [today - DAY, today]) {
    for (const s of set) {
      const [h, m] = String(s.start).split(':').map(Number);
      const start = new Date(base + (h * 60 + m) * 60000);
      out.push({ start, end: new Date(start.getTime() + (s.mins || 90) * 60000), dj: s.dj });
    }
  }
  return out.sort((a, b) => a.start - b.start);
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
//
// Dedupes the set.json day-anchor overlap: between midnight and the end of a
// set that began the previous evening, the same DJ appears twice (the slot
// finishing now, and tonight's repeat of it). Keep the one in progress and drop
// the later twin, so !set does not list the same name twice. Discord slots have
// absolute timestamps and never collide this way.
function futureOnly(slots) {
  const now = Date.now();
  const live = slots.filter(s => s.end.getTime() > now);
  const seen = new Set();
  const out = [];
  for (const s of live) {
    const key = `${s.dj}@${s.start.getHours()}:${s.start.getMinutes()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out.slice(0, MAX_SLOTS);
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
