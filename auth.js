// Replace with twith oauth token generated
const token = `<TOKEN>`;
const auth = `oauth:${token}`;
const opts = {
    identity: {
      username: 'refugechat',
      password: auth
    },
    channels: [
      'refugevr'
    ]
  };

module.exports = {
  token,
  opts, 
  auth
  }