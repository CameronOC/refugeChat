const tmi = require('tmi.js');
const oauth = require('./auth.js');
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
  if(minutes === 0){
    client.say(opts.channels[0], getDJ);
  } else if(minutes % 10 === 0){
    client.say(opts.channels[0], `To get the current dj send !dj`);
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
    client.say(target, getDJ);
    console.log(`* Executed ${commandName} command`);
  } else {
    console.log(`* Unknown command ${commandName}`);
  }
}

// Function called when the "dj" command is issued
function getDJ () {
  let dj = 'dj';
  return `The current DJ is: ${dj}`
}

// Called every time the bot connects to Twitch chat
function onConnectedHandler (addr, port) {
  console.log(`* Connected to ${addr}:${port}`);
  console.log(`Beginning sendComands info for twitch enjoyers`);
  setInterval(sendCommands, 60000);
}
