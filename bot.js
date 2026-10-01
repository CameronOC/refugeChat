const tmi = require('tmi.js');
const { getOpts } = require('./auth.js');
const { getLineup, futureOnly } = require('./lineup.js');
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
// Comands for the bot
// Warms the lineup cache at startup and surfaces a bad Discord token in the
// logs immediately, rather than on the first !set in chat.
getSet().then(l => console.log(l)).catch(e => console.log(`[lineup] ${e.message}`));
const sendCommands = async (data) => {
  let date = new Date();
  const minutes = date.getMinutes();
  console.log(`Checking current minute ${minutes}`);
  if(minutes === 0){
    try {
      const dj = await getDJ();
      client.say(opts.channels[0], dj);
    } catch(e){
      console.log(e);
    }
  } else if(minutes % 30 === 0){
    console.log(`Pasting commands for users to utilize`);
    try {
      client.say(opts.channels[0], `To get the current dj type !dj`);
    }catch(e){
      console.log(e);
    }
  }
};

// Called every time a message comes in
async function onMessageHandler (target, context, msg, self) {
  if (self) { return; } // Ignore messages from the bot

  // Remove whitespace from chat message
  const commandName = msg.trim();
  console.log(commandName);

  // If the command is known, let's execute it
  if (commandName === '!dj') {
    try {
      const dj = await getDJ();
      client.say(target, dj);
      console.log(`* Executed ${commandName} command`);
    }catch(e){
      console.log(`Could not execute dj command ${e}`);
    }
  } else if(commandName === '!set'){
    try {
    const setList = getSet();
    client.say(target, setList);
  }catch(e){
    console.log(`Could not execute dj command ${e}`);
  }
  } else if(commandName === '!deez'){
    client.say(target, `deez nuts`);
    console.log(`* Executed ${commandName} command`);
  } else if(commandName === '!penis'){
    client.say(target, `penis`);
    console.log(`* Executed ${commandName} command`);
  } else {
    console.log(`* Unknown command ${commandName}`);
  }
}

// Slots carry real Date objects, so formatting is all that is left here.
// 15:00 -> "3:00 PM", in the host timezone (TZ is set in docker-compose.yml).
function fmtTime (d) {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function slotMins (s) {
  return Math.round((s.end.getTime() - s.start.getTime()) / 60000);
}

// Function called when the "dj" command is issued
async function getDJ () {
  const { slots } = await getLineup();
  const now = Date.now();
  const slot = slots.find(s => now >= s.start.getTime() && now < s.end.getTime());
  if(!slot) return `No set on right now`;
  return `The current DJ is: ${slot.dj}`
}

// Function called when the "set" command is issued
async function getSet () {
  const { slots, source } = await getLineup();
  const upcoming = futureOnly(slots);
  if(!upcoming.length) return `No lineup set`;
  let setList = `Lineup: (times are in YOUR TIMEZONE)`;
  for(const s of upcoming){
    setList += `
    ${fmtTime(s.start)} ${s.dj} (${slotMins(s)} min)`;
  }

  console.log(`[lineup] served from ${source}`);
  return setList;
}

// Called every time the bot connects to Twitch chat
function onConnectedHandler (addr, port) {
  console.log(`* Connected to ${addr}:${port}`);
  console.log(`Beginning send Commands info for twitch enjoyers`);
  setInterval(sendCommands, 60000);
}
