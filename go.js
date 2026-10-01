// Convenience: serves a short tailnet URL that 302s to the Twitch consent page,
// so the long authorize URL never has to be copied by hand. Also accepts the
// /callback if the browser can reach this host (e.g. via ssh -L).
const http = require('http');
const { URLSearchParams } = require('url');

const ID = process.env.TWITCH_CLIENT_ID;
const REDIRECT = process.env.TWITCH_REDIRECT || 'http://localhost:3080/callback';
const PORT = Number(process.env.GO_PORT || 3080);
const BIND = process.env.GO_BIND || '127.0.0.1';

const consent = 'https://id.twitch.tv/oauth2/authorize?' + new URLSearchParams({
  response_type: 'code', client_id: ID, redirect_uri: REDIRECT,
  scope: 'chat:read chat:edit'
});

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  const hasCode = u.searchParams.has('code') || u.searchParams.has('error');
  if (u.pathname === '/callback' || hasCode) {
    const err = u.searchParams.get('error');
    if (err) {
      console.error('twitch returned error: ' + err + ' - ' + (u.searchParams.get('error_description')||''));
      res.writeHead(400).end('twitch error: ' + err);
      return;
    }
    const code = u.searchParams.get('code');
    if (!code) { res.writeHead(400).end('no code'); return; }
    try {
      const body = new URLSearchParams({
        client_id: ID, client_secret: process.env.TWITCH_CLIENT_SECRET, code,
        grant_type: 'authorization_code', redirect_uri: REDIRECT
      });
      const r = await fetch('https://id.twitch.tv/oauth2/token', { method: 'POST', body });
      const d = await r.json();
      if (!d.refresh_token) throw new Error(JSON.stringify(d));
      require('fs').writeFileSync(require('path').join(__dirname, '.token-cache.json'),
        JSON.stringify({ access_token: d.access_token, refresh_token: d.refresh_token,
          expires_at: Date.now() + (d.expires_in || 14400) * 1000 }, null, 2), { mode: 0o600 });
      console.log('\nAUTHORIZED. refresh_token=' + d.refresh_token + '\n');
      res.end('refugeChat authorized - you can close this tab.');
    } catch (e) {
      console.error('exchange failed: ' + e.message);
      res.writeHead(500).end('exchange failed: ' + e.message);
    }
    return;
  }
  res.writeHead(302, { Location: consent }).end();
}).listen(PORT, BIND, () => {
  console.log(`redirector on http://${BIND}:${PORT}/  ->  consent page`);
});
