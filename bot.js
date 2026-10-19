const tmi = require('tmi.js');
const { getOpts } = require('./auth.js');
const { getLineup } = require('./lineup.js');
const commands = require('./commands.js');
const { isLive } = require('./live.js');
// import { REST, Routes } from 'discord.js';

// Options are resolved asynchronously - token.js mints a fresh access token
// from the stored refresh token before we connect.
let opts;
let client;
// Register our event handlers (defined below)
function wire() {
  client.on('message', onMessageHandler);
  client.on('connected', onConnectedHandler);
}

// Connect to Twitch:
(async () => {
  try {
    opts = await getOpts();
    client = new tmi.client(opts);
    wire();
    await client.connect();
  } catch (e) {
    console.error('[startup]', e.message);
    process.exit(1);
  }
})();
// Every outbound line goes through here: the bot only talks while the channel
// is actually streaming. See live.js for the cached Helix check.
async function say (target, message) {
  if (!(await isLive(target))) {
    console.log(`[live] suppressed while offline: ${String(message).split('\n')[0]}`);
    return false;
  }
  // A dropped IRC socket rejects with "Not connected to server."; left
  // unawaited, that rejection crashed the whole process.
  try {
    await client.say(target, message);
  } catch (e) {
    console.log(`[say] failed: ${e.message || e}`);
    return false;
  }
  return true;
}

// Commands live in commands.js; this file only wires them to Twitch.
// Warms the lineup cache at startup and surfaces a bad Discord token in the
// logs immediately, rather than on the first !set in chat.
setMsgFor().then(l => console.log(l)).catch(e => console.log(`[lineup] ${e.message}`));
async function setMsgFor () {
  const { slots, source } = await getLineup();
  console.log(`[lineup] served from ${source}`);
  return commands.setMsg(slots);
}

let tipIndex = 0;
const sendCommands = async (data) => {
  const channel = opts.channels[0];
  let date = new Date();
  const minutes = date.getMinutes();
  // Nothing to announce into an offline channel - bail before doing any work
  // (this is also what keeps the log quiet while the stream is down).
  if (minutes !== 0 && minutes % 30 !== 0) return;
  if (!(await isLive(channel))) return;
  console.log(`Checking current minute ${minutes}`);
  if(minutes === 0){
    try {
      const { slots } = await getLineup();
      await say(channel, commands.djMsg(slots));
    } catch(e){
      console.log(e);
    }
  } else {
    const tip = commands.TIPS[tipIndex++ % commands.TIPS.length];
    console.log(`Posting tip: ${tip}`);
    try {
      await say(channel, tip);
    }catch(e){
      console.log(e);
    }
  }
};

// `${channel} ${command}` -> epoch ms the cooldown ends.
const cooldowns = new Map();

// Called every time a message comes in
async function onMessageHandler (target, context, msg, self) {
  if (self) { return; } // Ignore messages from the bot

  const text = msg.trim();
  console.log(text);
  const parsed = commands.parse(text);
  if (!parsed) return;
  const cmd = commands.COMMANDS[parsed.name];
  if (!cmd) {
    console.log(`* Unknown command ${parsed.name}`);
    return;
  }

  const key = `${target} ${parsed.name}`;
  const until = cooldowns.get(key) || 0;
  if (Date.now() < until) {
    console.log(`* ${parsed.name} on cooldown for ${Math.ceil((until - Date.now()) / 1000)}s`);
    return;
  }

  try {
    const reply = await cmd.run(parsed.args, context);
    if (reply && await say(target, reply)) {
      cooldowns.set(key, Date.now() + (cmd.cooldown || 0) * 1000);
      console.log(`* Executed ${parsed.name}`);
    }
  } catch(e){
    console.log(`Could not execute ${parsed.name}: ${e}`);
  }
}

// Called every time the bot connects to Twitch chat
function onConnectedHandler (addr, port) {
  console.log(`* Connected to ${addr}:${port}`);
  console.log(`Beginning send Commands info for twitch enjoyers`);
  setInterval(sendCommands, 60000);
}
