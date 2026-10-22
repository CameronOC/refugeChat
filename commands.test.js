// node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('./commands.js');
const Z = new Date().toLocaleTimeString('en-US', { timeZoneName: 'short' }).split(' ').pop();
const { summarize, extractLinks } = require('./lineup.js');

// Fixed clock: Wed 2026-10-21 16:50 local. Refuge 205 runs 3:00 PM - 12:00 AM.
const NOW = new Date(2026, 9, 21, 16, 50).getTime();
const at = (d, h, m = 0) => new Date(2026, 9, d, h, m);
const slot = (start, end, dj, event, eventName) => ({ start, end, dj, event, eventName });
const tonight = [
  slot(at(21, 15, 0), at(21, 16, 30), 'Mackamora', 'A', 'Refuge 205'),
  slot(at(21, 16, 30), at(21, 18, 0), 'EQNX', 'A', 'Refuge 205'),
  slot(at(21, 18, 0), at(21, 19, 30), 'apl', 'A', 'Refuge 205'),
  slot(at(21, 22, 30), at(22, 0, 0), 'Lavy', 'A', 'Refuge 205'),
];
const tomorrow = [
  slot(at(22, 20, 0), at(22, 21, 30), "D'vocean", 'B', 'Waiting Room'),
];
const slots = [...tonight, ...tomorrow];
const events = [
  { id: 'A', name: 'Refuge 205', start: at(21, 3), end: at(22, 1), firstSet: at(21, 15),
    blurb: 'Welcome all refugees to Wednesday house night!',
    links: ['https://vrc.group/REFUGE.2009', 'https://refugevr.co'], openDecks: true },
  { id: 'B', name: 'Waiting Room', start: at(22, 20), end: at(23, 1), firstSet: at(22, 20), blurb: '', links: [] },
];

test('!dj: current DJ, open decks in a gap and after the last set, curated nights excepted', () => {
  assert.equal(C.djMsg(slots, NOW, events), 'The current DJ is: EQNX');
  // Gap between apl and Lavy.
  assert.equal(C.djMsg(slots, at(21, 20, 0).getTime(), events),
    `Open decks right now, anyone can hop on! Next set: Lavy at 10:30 PM ${Z}`);
  // After the last set.
  assert.equal(C.djMsg(slots, at(22, 0, 30).getTime(), events), 'Open decks right now, anyone can hop on!');
  // set.json fallback has no event metadata: still open decks.
  assert.equal(C.djMsg(tonight.map(({ event, eventName, ...r }) => r), at(22, 0, 30).getTime()),
    'Open decks right now, anyone can hop on!');
  // An event whose description never mentions open decks.
  const curated = events.map(e => e.id === 'A' ? { ...e, openDecks: false } : e);
  assert.equal(C.djMsg(slots, at(21, 20, 0).getTime(), curated), `No set on right now. Next set: Lavy at 10:30 PM ${Z}`);
});

test('!next during a set, during a gap, and at the last set', () => {
  assert.equal(C.nextMsg(slots, NOW), `EQNX is on now. Up next: apl at 6:00 PM ${Z} (in 70 min)`);
  assert.equal(C.nextMsg(slots, at(21, 20, 0).getTime()), `Up next: Lavy at 10:30 PM ${Z} (in 150 min)`);
  assert.equal(C.nextMsg(slots, at(21, 23, 0).getTime()), `Lavy is the last set tonight. Next event: Waiting Room, Thu 8:00 PM ${Z}`);
  assert.equal(C.nextMsg(tonight, at(21, 23, 0).getTime()), 'Lavy is the last set tonight');
  assert.equal(C.nextMsg([], NOW), 'No upcoming sets');
});

test('!timeleft', () => {
  assert.equal(C.timeleftMsg(slots, NOW), 'EQNX has 70 min left, then apl');
  assert.equal(C.timeleftMsg(slots, at(21, 23, 0).getTime()), 'Lavy has 60 min left');
  // No set on: falls through to !next so the answer is still useful.
  assert.equal(C.timeleftMsg(slots, at(21, 20, 0).getTime()), `Up next: Lavy at 10:30 PM ${Z} (in 150 min)`);
});

test('!set is scoped to tonight and titled', () => {
  const m = C.setMsg(slots, NOW);
  assert.match(m, /^Refuge 205 lineup \(times in \w+\):/);
  assert.match(m, /4:30 PM EQNX \(90 min\)/);
  assert.doesNotMatch(m, /Mackamora/, 'finished set is dropped');
  assert.doesNotMatch(m, /D'vocean/, "tomorrow's event is not mixed in");
});

test('!event before and after the first set, and with no current event', () => {
  assert.equal(C.eventMsg({ slots, events }, NOW),
    'Refuge 205: started 3:00 PM | Welcome all refugees to Wednesday house night! | https://refugevr.co');
  assert.match(C.eventMsg({ slots, events }, at(21, 10, 0).getTime()), /^Refuge 205: starts 3:00 PM \w+ \|/);
  assert.match(C.eventMsg({ slots, events }, at(22, 3, 0).getTime()), /^Waiting Room: starts 8:00 PM/);
  assert.equal(C.eventMsg({ slots: [], events: [] }, NOW), 'No event scheduled');
});

test('!vrc uses the link from the event, else the default', () => {
  assert.equal(C.vrcMsg({ slots, events }), 'Join the VRChat group to get into the event: https://vrc.group/REFUGE.2009');
  assert.match(C.vrcMsg({ slots: [], events: [] }), /https:\/\/vrc\.group\/REFUGE\.2009$/);
});

test('!commands lists visible commands once, no aliases or jokes', () => {
  const m = C.commandsMsg();
  assert.match(m, /^Commands: !dj \(/);
  for (const n of ['!next', '!timeleft', '!set', '!event', '!vrc', '!commands']) assert.match(m, new RegExp(`\\${n} \\(`));
  assert.doesNotMatch(m, /!deez|!penis|!lineup|!up\b|!help/);
  assert.ok(m.length < 400, `fits a Twitch message: ${m.length}`);
});

test('parse takes the first word only and is case-insensitive', () => {
  assert.deepEqual(C.parse('!DJ please'), { name: '!dj', args: 'please' });
  assert.deepEqual(C.parse('  !set'), { name: '!set', args: '' });
  assert.equal(C.parse('hello !dj'), null);
  assert.equal(C.parse('🔥🔥🔥'), null);
  assert.ok(C.COMMANDS[C.parse('!lineup').name] === C.COMMANDS['!set'], 'alias resolves');
});

test('summarize and extractLinks on a real description', () => {
  const d = "### Refuge 205\n\nWelcome all refugees to Wednesday house night!\n\n**Lineup: (times are in YOUR TIMEZONE)**\n<t:1792620000:t> Mackamora (90 min)\n\nOpen decks after as always.\n\n**Join the VRChat group to join the event:**\n<https://vrc.group/REFUGE.2009>\n\n<https://refugevr.co>";
  assert.equal(summarize(d), 'Welcome all refugees to Wednesday house night!');
  assert.deepEqual(extractLinks(d), ['https://vrc.group/REFUGE.2009', 'https://refugevr.co']);
  assert.equal(summarize("### Broken\n\nA broken beat focused event. Expect jungle/breaks.\n"), 'A broken beat focused event. Expect jungle/breaks.');
  assert.equal(summarize(''), '');
});

test('half-hour tips skip the !dj pointer during open decks', () => {
  const during = [0, 1, 2, 3].map(i => C.pickTip(i, slots, NOW));
  assert.equal(during[0], 'Who is playing? Type !dj. Who is next? Type !next');
  assert.equal(new Set(during).size, 4, 'all four tips rotate while a set is on');

  const gap = at(21, 20, 0).getTime();
  const open = [0, 1, 2, 3, 4, 5].map(i => C.pickTip(i, slots, gap));
  assert.ok(open.every(tip => !/!dj/.test(tip)), 'no tip mentions !dj during open decks');
  assert.equal(new Set(open).size, 3, 'the other three still rotate');
  assert.equal(C.pickTip(0, [], NOW), 'Type !set for tonight\'s full lineup, or !event for what tonight is about');
});
