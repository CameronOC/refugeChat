// One-shot setup check for the Discord lineup source. Run it on the box that
// holds .env before (re)starting the bot:
//
//   set -a; . ./.env; set +a; node discord-check.js
//
// It prints exactly what !set would serve from Discord, or explains why the
// bot would fall back to set.json instead. Nothing is sent to Twitch.
const { fromDiscord, discordConfigured, futureOnly } = require('./lineup.js');

(async () => {
  if (!discordConfigured()) {
    console.log('DISCORD_TOKEN and/or DISCORD_GUILD_ID are empty. The bot will use set.json.');
    console.log('Fill both in .env (see the comments there), then rerun this check.');
    process.exit(2);
  }
  let slots;
  try {
    slots = await fromDiscord();
  } catch (e) {
    console.log(`Discord fetch FAILED: ${e.message}`);
    console.log('401 = bad token. 403/50001 = bot is not in the server, or lacks View Channels. 404 = wrong guild id.');
    process.exit(1);
  }
  console.log(`Discord returned ${slots.length} usable scheduled event(s):`);
  for (const s of slots) {
    console.log(`  ${s.start.toLocaleString()} -> ${s.end.toLocaleString()}  ${s.dj}`);
  }
  const up = futureOnly(slots);
  console.log(`\n!set would list ${up.length} current/upcoming slot(s)${up.length ? ':' : '. The bot would fall back to set.json.'}`);
  for (const s of up) console.log(`  ${s.start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} ${s.dj}`);
})();
