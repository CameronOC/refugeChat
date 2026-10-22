// Chat commands. Each builder is a pure function of the lineup and the clock so
// it can be tested without Twitch or Discord; bot.js only does the plumbing.
const { getLineup, futureOnly, currentEvent } = require('./lineup.js');

const VRC_URL = process.env.VRC_GROUP_URL || 'https://vrc.group/REFUGE.2009';
const SITE_URL = process.env.SITE_URL || 'https://refugevr.co';

// 15:00 -> "3:00 PM", in the host timezone (TZ is set in docker-compose.yml).
function fmtTime (d) {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}
// Another day -> "Thu 8:00 PM".
function fmtWhen (d, now = Date.now()) {
  const sameDay = new Date(d).toDateString() === new Date(now).toDateString();
  return sameDay ? fmtTime(d) : `${d.toLocaleDateString('en-US', { weekday: 'short' })} ${fmtTime(d)}`;
}
function slotMins (s) {
  return Math.round((s.end.getTime() - s.start.getTime()) / 60000);
}
function minsUntil (d, now) {
  return Math.max(0, Math.round((d.getTime() - now) / 60000));
}
function zone () {
  return new Date().toLocaleTimeString('en-US', { timeZoneName: 'short' }).split(' ').pop();
}
function current (slots, now) {
  return slots.find(s => now >= s.start.getTime() && now < s.end.getTime());
}

// --- message builders -------------------------------------------------------

// With no set on, it is open decks (unless tonight's event says otherwise),
// and we point at the next scheduled set if there is one tonight.
function djMsg (slots, now = Date.now(), events = []) {
  const slot = current(slots, now);
  if (slot) return `The current DJ is: ${slot.dj}`;

  // Tonight's event is the one whose window contains now; the next set only
  // counts if it belongs to it, so after the last set we do not advertise
  // tomorrow's opener as "next".
  const ev = events.find(e => e.start.getTime() <= now && e.end && e.end.getTime() > now);
  const upcoming = futureOnly(slots, now);
  const scope = ev ? upcoming.filter(s => s.event === ev.id) : upcoming;
  const next = scope.find(s => s.start.getTime() > now);
  const open = ev ? ev.openDecks : true;
  const tail = next ? ` Next set: ${next.dj} at ${fmtWhen(next.start, now)}` : '';
  return open ? `Open decks right now, anyone can hop on!${tail}` : `No set on right now.${tail}`;
}

function setMsg (slots, now = Date.now()) {
  const upcoming = currentEvent(futureOnly(slots, now));
  if (!upcoming.length) return 'No lineup set';
  // Twitch cannot localise times per viewer the way Discord's <t:> markup
  // does, so say which zone these are.
  const title = upcoming[0].eventName ? `${upcoming[0].eventName} lineup` : 'Lineup';
  let out = `${title} (times in ${zone()}):`;
  for (const s of upcoming) out += `\n    ${fmtTime(s.start)} ${s.dj} (${slotMins(s)} min)`;
  return out;
}

function nextMsg (slots, now = Date.now()) {
  const upcoming = futureOnly(slots, now);
  const cur = current(upcoming, now);
  const tonight = currentEvent(upcoming);
  const next = tonight.find(s => s.start.getTime() > now);
  if (next) {
    const lead = cur ? `${cur.dj} is on now. ` : '';
    return `${lead}Up next: ${next.dj} at ${fmtWhen(next.start, now)} (in ${minsUntil(next.start, now)} min)`;
  }
  // Nothing more in this event: point at the next one if there is one.
  const later = upcoming.find(s => cur ? s.event !== cur.event && s.start.getTime() > now : s.start.getTime() > now);
  if (cur && later) {
    return `${cur.dj} is the last set tonight. Next event: ${later.eventName || later.dj}, ${fmtWhen(later.start, now)}`;
  }
  if (cur) return `${cur.dj} is the last set tonight`;
  return 'No upcoming sets';
}

function timeleftMsg (slots, now = Date.now()) {
  const cur = current(slots, now);
  if (!cur) return nextMsg(slots, now);
  const left = minsUntil(cur.end, now);
  const next = currentEvent(futureOnly(slots, now)).find(s => s.start.getTime() > now);
  const tail = next ? `, then ${next.dj}` : '';
  return `${cur.dj} has ${left} min left${tail}`;
}

function eventMsg (lineup, now = Date.now()) {
  const { slots, events = [] } = lineup;
  const upcoming = currentEvent(futureOnly(slots, now));
  const ev = upcoming.length ? events.find(e => e.id === upcoming[0].event) : events.find(e => e.end && e.end.getTime() > now);
  if (!ev) {
    return upcoming.length ? `Tonight: ${upcoming.length} sets, first at ${fmtWhen(upcoming[0].start, now)}` : 'No event scheduled';
  }
  const started = ev.firstSet.getTime() <= now;
  const when = started ? `started ${fmtTime(ev.firstSet)}` : `starts ${fmtWhen(ev.firstSet, now)} ${zone()}`;
  const parts = [`${ev.name}: ${when}`];
  if (ev.blurb) parts.push(ev.blurb);
  const site = ev.links.find(l => !/vrc\.group/i.test(l)) || SITE_URL;
  parts.push(site);
  return parts.join(' | ');
}

function vrcMsg (lineup) {
  const ev = (lineup.events || []).find(e => e.links.some(l => /vrc\.group/i.test(l)));
  const url = ev ? ev.links.find(l => /vrc\.group/i.test(l)) : VRC_URL;
  return `Join the VRChat group to get into the event: ${url}`;
}

// --- command table ----------------------------------------------------------
//
// cooldown: seconds a command stays quiet after answering, per channel, so a
// chat spamming !vrc does not eat the bot's 20-messages-per-30s budget.

const COMMANDS = {
  '!dj':       { cooldown: 5,  help: 'who is playing now',           run: async () => { const l = await getLineup(); return djMsg(l.slots, Date.now(), l.events); } },
  '!next':     { cooldown: 5,  help: 'who is on after this set',     run: async () => nextMsg((await getLineup()).slots) },
  '!timeleft': { cooldown: 5,  help: 'time left in the current set', run: async () => timeleftMsg((await getLineup()).slots) },
  '!set':      { cooldown: 10, help: 'tonight\'s full lineup',        run: async () => setMsg((await getLineup()).slots) },
  '!event':    { cooldown: 10, help: 'what tonight\'s event is',      run: async () => eventMsg(await getLineup()) },
  '!vrc':      { cooldown: 10, help: 'VRChat group link',            run: async () => vrcMsg(await getLineup()) },
  '!commands': { cooldown: 15, help: 'this list',                    run: async () => commandsMsg() },
  '!deez':     { cooldown: 10, hidden: true, run: async () => 'deez nuts' },
  '!penis':    { cooldown: 10, hidden: true, run: async () => 'penis' },
};
// Aliases people type anyway.
COMMANDS['!lineup'] = COMMANDS['!set'];
COMMANDS['!up'] = COMMANDS['!next'];
COMMANDS['!help'] = COMMANDS['!commands'];

function commandsMsg () {
  const seen = new Set();
  const parts = [];
  for (const [name, c] of Object.entries(COMMANDS)) {
    if (c.hidden || seen.has(c)) continue;
    seen.add(c);
    parts.push(`${name} (${c.help})`);
  }
  return `Commands: ${parts.join(', ')}`;
}

// Rotated into chat on the half hour instead of the old fixed "type !dj".
const TIPS = [
  'Who is playing? Type !dj. Who is next? Type !next',
  'Type !set for tonight\'s full lineup, or !event for what tonight is about',
  'Want in? Type !vrc for the VRChat group link',
  'Type !commands to see everything this bot answers',
];

// Parse a chat line into { name, args }. Only the first word is the command,
// so "!dj please" still works.
function parse (msg) {
  const m = String(msg || '').trim().match(/^(![a-z0-9_]+)\b\s*(.*)$/i);
  if (!m) return null;
  return { name: m[1].toLowerCase(), args: m[2] };
}

module.exports = {
  COMMANDS, TIPS, parse, commandsMsg,
  djMsg, setMsg, nextMsg, timeleftMsg, eventMsg, vrcMsg,
  fmtTime, fmtWhen, slotMins
};
