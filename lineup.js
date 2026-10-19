// Lineup source: Discord guild scheduled events, with set.json as a fallback.
//
// The group posts one event per night, and the lineup is the event's
// description: one DJ per line with a time. parseDescription() turns those
// lines into slots. An event whose description has no parsable times is
// treated the old way, as a single slot named after the event. Events are
// cached briefly so a room full of people spamming !set cannot rate-limit us
// against Discord.
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
let warnedUnconfigured = false;

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

// --- Description parsing -----------------------------------------------------
//
// Lineups get typed by hand, so accept the shapes people actually use:
//   3:00 PM heelix            15:00 - heelix           3pm: heelix
//   - **3:00pm** heelix       heelix @ 3:00 PM         3:00-4:30 PM heelix
//   <t:1760000000:t> heelix   (Discord timestamp markup, absolute)
// One slot per line that contains a time. Lines without one (titles, "doors
// at", emoji rows) are ignored. Bare times with no am/pm are resolved to the
// reading that keeps the lineup moving forward from the event's start, so a
// 3:00 line on a 3 PM event means 15:00, and a 12:30 after 11:00 PM is 00:30.

const TS_RE = /<t:(\d{9,11})(?::[tTdDfFR])?>/g;
// 3, 3:00, 3.00, 3pm, 3:00pm, 3:00 p.m., 15:00, 1500h is deliberately NOT matched.
const TIME_RE = /\b(\d{1,2})(?:[:.](\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?(?=[\s\-–—:,|)]|$)/gi;

function stripMarkdown(t) {
  return t
    .replace(/<a?:\w+:\d+>/g, ' ')         // custom emoji
    .replace(/[*_~`>#]+/g, ' ')            // bold/italic/strike/code/quote/heading
    .replace(/[•·▪◦‣]/g, ' ');
}

// Trim what is left of a line once the time tokens are removed.
function cleanName(t) {
  return t
    .replace(/^[\s\-–—:|,.@]+|[\s\-–—:|,.@]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// Wall-clock -> Date on the event's day, with am/pm inference.
// `floor` is the earliest moment this slot may start (previous slot, or the
// event start minus a little slack for a line like "2:55 doors").
function resolveClock(h, m, ampm, floor, base) {
  if (ampm) {
    const pm = /^p/i.test(ampm);
    if (h === 12) h = pm ? 12 : 0;
    else if (pm) h += 12;
  }
  const candidates = [];
  const day = new Date(base); day.setHours(0, 0, 0, 0);
  for (const dayOff of [0, 1]) {
    // Bare "12:30" is either noon or half past midnight; bare "3" is 3 or 15.
    const hours = ampm ? [h] : (h === 12 ? [0, 12] : h < 12 ? [h, h + 12] : [h]);
    for (const hh of hours) {
      candidates.push(new Date(day.getTime() + dayOff * 86400000 + (hh * 60 + m) * 60000));
    }
  }
  // Earliest candidate that is not before the floor.
  const ok = candidates.filter(d => d.getTime() >= floor).sort((a, b) => a - b);
  return ok[0] || candidates.sort((a, b) => a - b)[0];
}

function parseDescription(desc, eventStart, eventEnd) {
  if (!desc || typeof desc !== 'string') return [];
  const SLACK = 15 * 60000;
  let floor = eventStart.getTime() - SLACK;
  const slots = [];

  for (const rawLine of desc.split(/\r?\n/)) {
    const times = [];
    // Absolute Discord timestamps first (before markdown stripping, which
    // would eat the closing '>'); they need no inference.
    let line = rawLine.replace(TS_RE, (_, secs) => { times.push(new Date(Number(secs) * 1000)); return ' '; });
    line = stripMarkdown(line);
    if (!line.trim()) continue;

    if (!times.length) {
      const clocks = [];
      // "3-4:30pm": a leading bare hour inherits the am/pm of the range end.
      // Checked before the general time scan, which would otherwise consume
      // the "4:30pm" and leave "3-" behind in the name.
      const range = line.match(
        /(?<![\d:.])(\d{1,2})(?:[:.](\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?\s*[-–—]\s*(\d{1,2})(?:[:.](\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?(?=[\s\-–—:,|)]|$)/i
      );
      // Only trust a range when at least one side looks like a time, so a
      // name like "DJ 2-3" is left alone.
      if (range && (range[2] || range[3] || range[5] || range[6])) {
        const ampm1 = range[3] || range[6] || null;
        clocks.push({ h: Number(range[1]), m: Number(range[2] || 0), ampm: ampm1 });
        clocks.push({ h: Number(range[4]), m: Number(range[5] || 0), ampm: range[6] || null });
        line = line.replace(range[0], ' ');
      }
      line = line.replace(TIME_RE, (whole, h, mm, ampm) => {
        h = Number(h); const m = mm ? Number(mm) : 0;
        // A bare number with no minutes and no am/pm is too ambiguous
        // ("DJ 2 Hot") unless it is clearly an hour in a range like "3-4pm".
        if (!mm && !ampm) return whole;
        if (h > 24 || m > 59) return whole;
        clocks.push({ h, m, ampm: ampm || null });
        return ' ';
      });
      if (!clocks.length) continue;
      let f = floor;
      for (const c of clocks) {
        const d = resolveClock(c.h, c.m, c.ampm, f, eventStart);
        times.push(d);
        f = d.getTime();
      }
    }

    const dj = cleanName(line);
    if (!dj) continue;
    const start = times[0];
    const end = times[1] && times[1] > start ? times[1] : null;
    slots.push({ start, end, dj });
    floor = start.getTime();
  }

  slots.sort((a, b) => a.start - b.start);
  // Missing end: next slot's start; the last one runs to the event's end.
  for (let i = 0; i < slots.length; i++) {
    if (slots[i].end) continue;
    const next = slots[i + 1];
    if (next) slots[i].end = new Date(next.start);
    else if (eventEnd && !isNaN(eventEnd) && eventEnd > slots[i].start) slots[i].end = new Date(eventEnd);
    else slots[i].end = new Date(slots[i].start.getTime() + 90 * 60000);
  }
  return slots;
}

function discordConfigured() {
  return Boolean(process.env.DISCORD_TOKEN && process.env.DISCORD_GUILD_ID);
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

  const match = process.env.LINEUP_EVENT_MATCH
    ? new RegExp(process.env.LINEUP_EVENT_MATCH, 'i')
    : null;

  const slots = [];
  for (const e of events) {
    if (e.status === CANCELED || e.status === COMPLETED) continue;
    if (!e.scheduled_start_time) continue;
    if (match && !match.test(e.name || '')) continue;
    const start = new Date(e.scheduled_start_time);
    if (isNaN(start)) continue;
    const end = e.scheduled_end_time ? new Date(e.scheduled_end_time) : null;

    const parsed = parseDescription(e.description, start, end);
    if (parsed.length) {
      slots.push(...parsed);
    } else if ((e.name || '').trim()) {
      slots.push({ start, end: end && !isNaN(end) ? end : null, dj: e.name.trim() });
    }
  }
  slots.sort((a, b) => a.start - b.start);

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
  if (!discordConfigured()) {
    // Say so once, loudly: this fallback ran silently in production for weeks
    // while the lineup kept being hand-edited into set.json.
    if (!warnedUnconfigured) {
      console.log('[lineup] DISCORD_TOKEN / DISCORD_GUILD_ID not set - lineup comes from set.json only');
      warnedUnconfigured = true;
    }
  } else {
    try {
      slots = await fromDiscord();
      if (slots && slots.length) {
        source = 'discord';
      } else {
        // Reachable but empty: nobody has created the events yet. Keep the
        // hand-maintained file as a safety net rather than announcing no lineup.
        console.log('[lineup] discord returned no events, falling back to set.json');
        slots = null;
      }
    } catch (e) {
      console.log(`[lineup] discord fetch failed, falling back to set.json: ${e.message}`);
      slots = null;
    }
  }
  if (!slots) slots = fromSetJson();

  cache = { at: Date.now(), slots, source };
  return cache;
}

module.exports = { getLineup, futureOnly, fromSetJson, fromDiscord, discordConfigured, parseDescription };
