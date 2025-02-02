const tmi = require('tmi.js');
const oauth = require('./auth.js');
const set = require('./set.json');
// import { REST, Routes } from 'discord.js';

// Define configuration options
const opts = oauth.opts;
// Create a client with our options
const client = new tmi.client(opts);
// Register our event handlers (defined below)
client.on('message', onMessageHandler);
client.on('connected', onConnectedHandler);

// Connect to Twitch:
client.connect();
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
  } else {
    console.log(`* Unknown command ${commandName}`);
  }
}

// Function called when the "dj" command is issued
function getDJ () {
  const date = new Date();
  let hour = date.getHours();
  const dj = set[hour];
  if(!dj) return `current dj is unknown`;
  return `The current DJ is: ${dj}`
}

// Function called when the "dj" command is issued
function getSet () {
  let setList = ``;
  for(let key in set){
    setList += `
    ${key}:00 PST ${set[key]}`;
  }

  console.log(setList);
  if(!setList) return `current dj is unknown`;
  return setList;
}

// Called every time the bot connects to Twitch chat
function onConnectedHandler (addr, port) {
  console.log(`* Connected to ${addr}:${port}`);
  console.log(`Beginning send Commands info for twitch enjoyers`);
  setInterval(sendCommands, 60000);
}
