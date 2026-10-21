// Credentials come from the environment and from token.js, never from this
// file - the value committed here previously was a live token in a public repo.
const { getAccessToken } = require('./token.js');

async function getOpts() {
  await getAccessToken(); // fail fast at startup if the refresh token is bad
  return {
    connection: { reconnect: true, secure: true },
    identity: {
      username: process.env.TWITCH_USER || 'refugechat',
      // A function, not a string: tmi.js calls it on every (re)connect, so a
      // reconnect hours after startup sends a current token instead of the
      // expired one the bot launched with.
      password: async () => `oauth:${await getAccessToken()}`
    },
    channels: (process.env.TWITCH_CHANNELS || 'refugevr').split(',').map(s => s.trim())
  };
}

module.exports = { getOpts };
