#!/usr/bin/env node
/* Exchanges a one-time Whoop authorisation code for a refresh token and
 * stores it encrypted in data/whoop-token.enc. Runs inside the
 * "Whoop authorise" GitHub Action — no local machine needed.
 *
 * Env vars:
 *   WHOOP_CLIENT_ID, WHOOP_CLIENT_SECRET, WHOOP_TOKEN_KEY  — repository secrets
 *   WHOOP_AUTH_CODE     — the code, or the full localhost URL Whoop redirected to
 *   WHOOP_REDIRECT_URI  — optional, must match the app's registered URI
 *                         (default http://localhost:8789/callback)
 */
import fs from 'node:fs';
import { encrypt } from './whoop-sync.mjs';

const TOKEN_URL = process.env.WHOOP_TOKEN_URL || 'https://api.prod.whoop.com/oauth/oauth2/token';
const REDIRECT = process.env.WHOOP_REDIRECT_URI || 'http://localhost:8789/callback';
const TOKEN_FILE = 'data/whoop-token.enc';

// Secrets and pasted inputs often carry stray whitespace/newlines — strip them
const envTrim = (k) => (process.env[k] || '').trim();
const WHOOP_CLIENT_ID = envTrim('WHOOP_CLIENT_ID');
const WHOOP_CLIENT_SECRET = envTrim('WHOOP_CLIENT_SECRET');
const WHOOP_AUTH_CODE = envTrim('WHOOP_AUTH_CODE');
const missing = [
  !WHOOP_CLIENT_ID && 'WHOOP_CLIENT_ID',
  !WHOOP_CLIENT_SECRET && 'WHOOP_CLIENT_SECRET',
  !envTrim('WHOOP_TOKEN_KEY') && 'WHOOP_TOKEN_KEY',
  !WHOOP_AUTH_CODE && 'WHOOP_AUTH_CODE (workflow input)',
].filter(Boolean);
if (missing.length) {
  console.error(`Missing: ${missing.join(', ')}.`);
  console.error('Add them in the repo under Settings → Secrets and variables → Actions → "Secrets" tab → "New repository secret" (NOT the Variables tab, and not Environment secrets). Names must match exactly, all caps.');
  process.exit(1);
}

/* Accept either the bare code or the whole pasted redirect URL. */
function extractCode(input) {
  const s = input.trim();
  if (s.includes('code=')) {
    try {
      return new URL(s).searchParams.get('code');
    } catch {
      const m = s.match(/[?&]code=([^&\s]+)/);
      return m ? decodeURIComponent(m[1]) : null;
    }
  }
  return s;
}

const code = extractCode(WHOOP_AUTH_CODE);
if (!code) {
  console.error('Could not find a code in the input. Paste the full URL from the address bar (it contains "code=...").');
  process.exit(1);
}

const body = new URLSearchParams({
  grant_type: 'authorization_code',
  code,
  client_id: WHOOP_CLIENT_ID,
  client_secret: WHOOP_CLIENT_SECRET,
  redirect_uri: REDIRECT,
});
const r = await fetch(TOKEN_URL, {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body,
});
const tok = await r.json().catch(() => ({}));
if (!r.ok || !tok.refresh_token) {
  console.error(`Token exchange failed (${r.status}): ${JSON.stringify(tok)}`);
  console.error('Auth codes expire after a few minutes and are single-use — get a fresh one and run this workflow again promptly. Also check the redirect URI matches the one registered on developer.whoop.com.');
  process.exit(1);
}

fs.mkdirSync('data', { recursive: true });
fs.writeFileSync(TOKEN_FILE, encrypt(tok.refresh_token) + '\n');
console.log(`✅ Whoop authorised — refresh token stored encrypted in ${TOKEN_FILE}.`);
