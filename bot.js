const tmi = require('tmi.js');
const { getOpts } = require('./auth.js');
const set = require('./set.json');
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
console.log(getSet());
const sendCommands =  (data) => {
  let date = new Date();
  const minutes = date.getMinutes();
  console.log(`Checking current minute ${minutes}`);
  if(minutes === 0){
    try {
      const dj = getDJ();
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
function onMessageHandler (target, context, msg, self) {
  if (self) { return; } // Ignore messages from the bot

  // Remove whitespace from chat message
  const commandName = msg.trim();
  console.log(commandName);

  // If the command is known, let's execute it
  if (commandName === '!dj') {
    try {
      const dj = getDJ();
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
  } else {
    console.log(`* Unknown command ${commandName}`);
  }
}

// Sets are 90 minutes and land on half hours, so slots are matched by
// minutes-since-midnight rather than by whole hour.
function toMinutes (hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

// 15:00 -> "3:00 PM"
function to12h (hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, '0')} ${suffix}`;
}

// Function called when the "dj" command is issued
function getDJ () {
  const now = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  const slot = set.find(s => {
    const start = toMinutes(s.start);
    return mins >= start && mins < start + s.mins;
  });
  if(!slot) return `No set on right now`;
  return `The current DJ is: ${slot.dj}`
}

// Function called when the "set" command is issued
function getSet () {
  if(!set.length) return `no lineup set`;
  let setList = `Lineup: (times are in YOUR TIMEZONE)`;
  for(const s of set){
    setList += `
    ${to12h(s.start)} ${s.dj} (${s.mins} min)`;
  }

  console.log(setList);
  return setList;
}

// Called every time the bot connects to Twitch chat
function onConnectedHandler (addr, port) {
  console.log(`* Connected to ${addr}:${port}`);
  console.log(`Beginning send Commands info for twitch enjoyers`);
  setInterval(sendCommands, 60000);
}
