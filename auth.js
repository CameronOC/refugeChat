// Credentials come from the environment, never from this file.
//
// The committed value previously here was a real Twitch OAuth token in a
// PUBLIC repo. Revoke it and set TWITCH_OAUTH instead - systemd loads it from
// /home/cameronoc/apps/refugeChat/.env, which is gitignored.
const token = process.env.TWITCH_OAUTH || '';
if (!token) {
  console.error('TWITCH_OAUTH is not set - refusing to start with no credential.');
  process.exit(1);
}
const auth = token.startsWith('oauth:') ? token : `oauth:${token}`;
const opts = {
  identity: {
    username: process.env.TWITCH_USER || 'refugechat',
    password: auth
  },
  channels: (process.env.TWITCH_CHANNELS || 'refugevr').split(',').map(s => s.trim())
};
module.exports = { token, opts, auth };
