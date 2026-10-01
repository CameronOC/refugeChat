// Credentials come from the environment and from token.js, never from this
// file - the value committed here previously was a live token in a public repo.
const { getAccessToken } = require('./token.js');

async function getOpts() {
  const token = await getAccessToken();
  return {
    identity: {
      username: process.env.TWITCH_USER || 'refugechat',
      password: `oauth:${token}`
    },
    channels: (process.env.TWITCH_CHANNELS || 'refugevr').split(',').map(s => s.trim())
  };
}

module.exports = { getOpts };
