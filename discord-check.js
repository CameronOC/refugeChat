// One-shot setup check for the Discord lineup source. Run it on the box that
// holds .env before (re)starting the bot:
//
//   set -a; . ./.env; set +a; node discord-check.js
//
// It prints exactly what !set would serve from Discord, or explains why the
// bot would fall back to set.json instead. Nothing is sent to Twitch.
const { fromDiscord, discordConfigured, futureOnly, currentEvent } = require('./lineup.js');

(async () => {
  if (!discordConfigured()) {
    console.log('DISCORD_TOKEN and/or DISCORD_GUILD_ID are empty. The bot will use set.json.');
    console.log('Fill both in .env (see the comments there), then rerun this check.');
    process.exit(2);
  }
  let slots, events;
  try {
    ({ slots, events } = await fromDiscord());
  } catch (e) {
    console.log(`Discord fetch FAILED: ${e.message}`);
    console.log('401 = bad token. 403/50001 = bot is not in the server, or lacks View Channels. 404 = wrong guild id.');
    process.exit(1);
  }
  console.log(`Discord returned ${events.length} event(s), ${slots.length} slot(s):`);
  for (const e of events) console.log(`  [${e.name}] ${e.firstSet.toLocaleString()} - ${e.blurb || '(no blurb)'} ${e.links.join(' ')}`);
  console.log('');
  for (const s of slots) {
    console.log(`  ${s.start.toLocaleString()} -> ${s.end.toLocaleString()}  ${s.dj}`);
  }
  const up = currentEvent(futureOnly(slots));
  console.log(`\n!set would list ${up.length} slot(s)${up[0] && up[0].eventName ? ` for "${up[0].eventName}"` : ""}${up.length ? ':' : '. The bot would fall back to set.json.'}`);
  for (const s of up) console.log(`  ${s.start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} ${s.dj}`);
})();
