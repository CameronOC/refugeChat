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
const sendCommands =  (data) => {
  let date = new Date();
  const minutes = date.getMinutes();
  const dj = getDJ();
  console.log(dj);
  console.log(`Checking current minute ${minutes}`);
  if(minutes === 0){
    console.log(`Getting current DJ`);
    const dj = getDJ();
    console.log(dj);
    try {
      client.say(opts.channels[0], dj);
    } catch(e){
      console.log(e);
    }
  } else if(minutes % 10 === 0){
    console.log(`Pasting commands for users to utilize`);

    try {
      console.log()
    client.say(opts.channels[0], `To get the current dj send !dj`);
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
    client.say(target, getDJ);
    console.log(`* Executed ${commandName} command`);
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
  let hour = date.getHours().toString();
  console.log(`current hour ${hour}`);
  let dj = set[`${hour}`];
  console.log(dj);
  return `The current DJ is: ${dj}`
}

// Called every time the bot connects to Twitch chat
function onConnectedHandler (addr, port) {
  console.log(`* Connected to ${addr}:${port}`);
  let dj = getDJ();
  console.log(set[`16`]);
  console.log(`Beginning send Commands info for twitch enjoyers`);
  setInterval(sendCommands, 60000);
}
