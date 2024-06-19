// Replace with twith oauth token generated
const token = `q1u8by6nxw8gmmwkxz6onap8st2h2d`;
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