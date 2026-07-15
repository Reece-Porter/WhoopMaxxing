#!/usr/bin/env node
/* One-time Whoop authorisation helper. Run this ON YOUR OWN MACHINE:
 *
 *   WHOOP_CLIENT_ID=xxx WHOOP_CLIENT_SECRET=yyy node scripts/whoop-auth.mjs
 *
 * Prerequisite: an app registered at https://developer.whoop.com with
 * redirect URI exactly  http://localhost:8789/callback
 *
 * It opens a login URL, catches the redirect on localhost, exchanges the
 * code and prints the refresh token to paste into your GitHub secrets.
 */
import http from 'node:http';
import crypto from 'node:crypto';

const CLIENT_ID = process.env.WHOOP_CLIENT_ID;
const CLIENT_SECRET = process.env.WHOOP_CLIENT_SECRET;
const REDIRECT = 'http://localhost:8789/callback';
const AUTH_URL = 'https://api.prod.whoop.com/oauth/oauth2/auth';
const TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token';
const SCOPE = 'offline read:recovery read:sleep read:cycles read:profile';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Set WHOOP_CLIENT_ID and WHOOP_CLIENT_SECRET environment variables first.');
  process.exit(1);
}

const state = crypto.randomBytes(8).toString('hex');
const url =
  `${AUTH_URL}?response_type=code&client_id=${encodeURIComponent(CLIENT_ID)}` +
  `&redirect_uri=${encodeURIComponent(REDIRECT)}&scope=${encodeURIComponent(SCOPE)}&state=${state}`;

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost:8789');
  if (u.pathname !== '/callback') { res.writeHead(404).end(); return; }
  const code = u.searchParams.get('code');
  if (u.searchParams.get('state') !== state || !code) {
    res.writeHead(400, { 'content-type': 'text/plain' }).end('State mismatch or missing code — try again.');
    return;
  }
  try {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT,
    });
    const r = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
    const tok = await r.json();
    if (!r.ok || !tok.refresh_token) throw new Error(JSON.stringify(tok));
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('Success! Go back to the terminal — you can close this tab.');
    console.log('\n✅ Authorised. Add these as GitHub repository secrets (Settings → Secrets and variables → Actions):\n');
    console.log('  WHOOP_CLIENT_ID     =', CLIENT_ID);
    console.log('  WHOOP_CLIENT_SECRET =', CLIENT_SECRET);
    console.log('  WHOOP_REFRESH_TOKEN =', tok.refresh_token);
    console.log('  WHOOP_TOKEN_KEY     =', crypto.randomBytes(24).toString('hex'), ' (freshly generated for you)');
    console.log('\nThen run the "Whoop sync" workflow from the Actions tab.');
  } catch (e) {
    res.writeHead(500, { 'content-type': 'text/plain' }).end('Token exchange failed: ' + e.message);
    console.error('Token exchange failed:', e.message);
  } finally {
    server.close();
  }
});

server.listen(8789, () => {
  console.log('Open this URL in your browser and log in to Whoop:\n\n' + url + '\n\nWaiting for the redirect on http://localhost:8789 …');
});
