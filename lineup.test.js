// node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseDescription } = require('./lineup.js');

// Event: Friday 3:00 PM -> 12:00 AM local.
const start = new Date(2026, 9, 16, 15, 0);
const end = new Date(2026, 9, 17, 0, 0);
const hm = d => `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
const names = s => s.map(x => x.dj);
const starts = s => s.map(x => hm(x.start));

test('12-hour with am/pm, bullets and bold', () => {
  const s = parseDescription(`**Lineup**
- **3:00 PM** heelix
- 4:30 PM Fives
- 6:00pm BVSTET
- 7:30 p.m. Ly
- 9 PM Shuubie
- 10:30 PM Bobby J
- 12:00 AM dazer0`, start, end);
  assert.deepEqual(names(s), ['heelix', 'Fives', 'BVSTET', 'Ly', 'Shuubie', 'Bobby J', 'dazer0']);
  assert.deepEqual(starts(s), ['15:00', '16:30', '18:00', '19:30', '21:00', '22:30', '0:00']);
  assert.equal(s[6].start.getDate(), 17, 'midnight slot lands on the next day');
  assert.equal(s[0].end.getTime(), s[1].start.getTime(), 'end inferred from next start');
  assert.equal(hm(s[6].end), '1:30', 'last slot defaults to 90 min when event end is not after it');
});

test('24-hour times and dash separators', () => {
  const s = parseDescription(`15:00 - heelix
16:30 – Fives
18:00 — BVSTET
23:00 | Lavy
00:30 dazer0`, start, end);
  assert.deepEqual(names(s), ['heelix', 'Fives', 'BVSTET', 'Lavy', 'dazer0']);
  assert.deepEqual(starts(s), ['15:00', '16:30', '18:00', '23:00', '0:30']);
});

test('bare 12-hour times with no am/pm roll forward from the event start', () => {
  const s = parseDescription(`3:00 heelix
4:30 Fives
11:00 Lavy
12:30 dazer0`, start, end);
  assert.deepEqual(starts(s), ['15:00', '16:30', '23:00', '0:30']);
  assert.equal(s[3].start.getDate(), 17);
});

test('name before time, and @ separator', () => {
  const s = parseDescription(`heelix @ 3:00 PM
Fives - 4:30 PM
Bobby J: 6pm`, start, end);
  assert.deepEqual(names(s), ['heelix', 'Fives', 'Bobby J']);
  assert.deepEqual(starts(s), ['15:00', '16:30', '18:00']);
});

test('time ranges give explicit ends', () => {
  const s = parseDescription(`3:00-4:30 PM heelix
4:30 - 6:00 PM Fives
6-7:30pm BVSTET`, start, end);
  assert.deepEqual(names(s), ['heelix', 'Fives', 'BVSTET']);
  assert.deepEqual(starts(s), ['15:00', '16:30', '18:00']);
  assert.equal(hm(s[0].end), '16:30');
  assert.equal(hm(s[2].end), '19:30');
});

test('discord <t:...> timestamps are absolute', () => {
  const a = new Date(2026, 9, 16, 15, 0), b = new Date(2026, 9, 16, 16, 30);
  const s = parseDescription(`<t:${a.getTime()/1000}:t> heelix
<t:${b.getTime()/1000}:F> Fives`, start, end);
  assert.deepEqual(starts(s), ['15:00', '16:30']);
  assert.deepEqual(names(s), ['heelix', 'Fives']);
});

test('lines without a time are ignored; DJ names with digits survive', () => {
  const s = parseDescription(`REFUGE FRIDAY 🔥
doors open early
3:00 PM M5E34
4:30 PM DJ 2 Hot
6:00 PM Gr1zzLy
see you there!`, start, end);
  assert.deepEqual(names(s), ['M5E34', 'DJ 2 Hot', 'Gr1zzLy']);
});

test('last slot runs to the event end when it is set', () => {
  const s = parseDescription(`9:00 PM Lavy\n10:30 PM dazer0`, start, end);
  assert.equal(s[1].end.getTime(), end.getTime());
});

test('empty or timeless description yields nothing', () => {
  assert.deepEqual(parseDescription('', start, end), []);
  assert.deepEqual(parseDescription(null, start, end), []);
  assert.deepEqual(parseDescription('just vibes, no schedule', start, end), []);
});

const { currentEvent, futureOnly } = require('./lineup.js');

test('real Refuge format: <t:> timestamps, durations, live hardware, TBA placeholders', () => {
  const t0 = Math.floor(new Date(2026, 9, 21, 15, 0).getTime() / 1000);
  const evStart = new Date(2026, 9, 21, 3, 0), evEnd = new Date(2026, 9, 22, 1, 0);
  const s = parseDescription(`### Refuge 205

Welcome all refugees to Wednesday house night!

**Lineup: (times are in YOUR TIMEZONE)**
<t:${t0}:t> Mackamora (90 min)
<t:${t0 + 5400}:t> MUNKS (60 min) (live hardware)
<t:${t0 + 9000}:t> Juoto (2 hour+) (live hardware)
<t:${t0 + 16200}:t> 4 (90 min)

Open decks after as always.

**Join the VRChat group to join the event:**
<https://vrc.group/REFUGE.2009>

<https://refugevr.co>`, evStart, evEnd);
  assert.deepEqual(names(s), ['Mackamora', 'MUNKS (live hardware)', 'Juoto (live hardware)', 'TBA']);
  assert.deepEqual(starts(s), ['15:00', '16:30', '17:30', '19:30']);
  assert.deepEqual(s.map(x => (x.end - x.start) / 60000), [90, 60, 120, 90]);
});

test('currentEvent keeps only the first event once past slots are dropped', () => {
  const now = Date.now(), H = 3600000;
  const mk = (off, dj, event) => ({ start: new Date(now + off * H), end: new Date(now + (off + 1.5) * H), dj, event });
  const slots = [
    mk(-3, 'done', 'A'), mk(-1, 'playing', 'A'), mk(0.5, 'next', 'A'),
    mk(24, 'tomorrow1', 'B'), mk(25.5, 'tomorrow2', 'B'),
  ];
  assert.deepEqual(names(currentEvent(futureOnly(slots))), ['playing', 'next']);
  // Nothing left tonight: tomorrow's event is what is up next.
  assert.deepEqual(names(currentEvent(futureOnly(slots.slice(3)))), ['tomorrow1', 'tomorrow2']);
  // set.json slots have no event tag and pass through.
  const plain = [mk(0.5, 'x'), mk(2, 'y')].map(({ event, ...r }) => r);
  assert.equal(currentEvent(plain).length, 2);
});
