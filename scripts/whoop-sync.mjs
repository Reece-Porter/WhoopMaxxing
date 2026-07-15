#!/usr/bin/env node
/* Whoop → data/whoop.json sync, designed to run in GitHub Actions.
 *
 * Env vars (from repository secrets):
 *   WHOOP_CLIENT_ID, WHOOP_CLIENT_SECRET  — from developer.whoop.com
 *   WHOOP_REFRESH_TOKEN                    — from scripts/whoop-auth.mjs (used on first run only)
 *   WHOOP_TOKEN_KEY                        — any long random string; encrypts the rotating token
 *   WHOOP_API_BASE (optional)              — defaults to https://api.prod.whoop.com/developer/v2
 *   WHOOP_SYNC_DAYS (optional)             — how far back to pull, default 90
 *
 * Whoop rotates refresh tokens on every use, so the current one is kept in
 * data/whoop-token.enc (AES-256-GCM, key = sha256(WHOOP_TOKEN_KEY)) and
 * committed by the workflow. The WHOOP_REFRESH_TOKEN secret is only the seed
 * for the very first run.
 */
import fs from 'node:fs';
import crypto from 'node:crypto';

const BASE = process.env.WHOOP_API_BASE || 'https://api.prod.whoop.com/developer/v2';
const TOKEN_URL = process.env.WHOOP_TOKEN_URL || 'https://api.prod.whoop.com/oauth/oauth2/token';
const DAYS = +(process.env.WHOOP_SYNC_DAYS || 90);
const TOKEN_FILE = 'data/whoop-token.enc';
const OUT_FILE = 'data/whoop.json';

// Secrets pasted into GitHub often carry a stray trailing newline — strip it
const envTrim = (k) => (process.env[k] || '').trim();
const WHOOP_CLIENT_ID = envTrim('WHOOP_CLIENT_ID');
const WHOOP_CLIENT_SECRET = envTrim('WHOOP_CLIENT_SECRET');
const WHOOP_TOKEN_KEY = envTrim('WHOOP_TOKEN_KEY');
if (!WHOOP_CLIENT_ID || !WHOOP_CLIENT_SECRET || !WHOOP_TOKEN_KEY) {
  console.error('Missing WHOOP_CLIENT_ID / WHOOP_CLIENT_SECRET / WHOOP_TOKEN_KEY.');
  console.error('Add them in the repo under Settings → Secrets and variables → Actions → "Secrets" tab → "New repository secret" (NOT the Variables tab, and not Environment secrets). Names must match exactly, all caps.');
  process.exit(1);
}
const KEY = crypto.createHash('sha256').update(WHOOP_TOKEN_KEY).digest();

export function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([c.update(text, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString('base64')).join('.');
}
function decrypt(blob) {
  const [iv, tag, enc] = blob.trim().split('.').map((s) => Buffer.from(s, 'base64'));
  const d = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
}

function loadRefreshToken() {
  if (fs.existsSync(TOKEN_FILE)) {
    try {
      return decrypt(fs.readFileSync(TOKEN_FILE, 'utf8'));
    } catch (e) {
      console.error(`Could not decrypt ${TOKEN_FILE} (WHOOP_TOKEN_KEY changed?): ${e.message}`);
    }
  }
  if (envTrim('WHOOP_REFRESH_TOKEN')) {
    console.log('Using WHOOP_REFRESH_TOKEN secret (first run).');
    return envTrim('WHOOP_REFRESH_TOKEN');
  }
  console.error('No refresh token available: set the WHOOP_REFRESH_TOKEN secret (run scripts/whoop-auth.mjs to get one).');
  process.exit(1);
}

/* OAuth clients can be registered for body credentials (client_secret_post)
 * or a Basic header (client_secret_basic); try the body first and fall back
 * to Basic on a 401 so either registration works. */
export async function tokenRequest(tokenUrl, params, clientId, clientSecret) {
  const form = { 'content-type': 'application/x-www-form-urlencoded' };
  let r = await fetch(tokenUrl, {
    method: 'POST',
    headers: form,
    body: new URLSearchParams({ ...params, client_id: clientId, client_secret: clientSecret }),
  });
  if (r.status === 401) {
    const basic = Buffer.from(`${encodeURIComponent(clientId)}:${encodeURIComponent(clientSecret)}`).toString('base64');
    r = await fetch(tokenUrl, {
      method: 'POST',
      headers: { ...form, authorization: `Basic ${basic}` },
      body: new URLSearchParams(params),
    });
  }
  return r;
}

async function refreshAccessToken(refreshToken) {
  const r = await tokenRequest(
    TOKEN_URL,
    { grant_type: 'refresh_token', refresh_token: refreshToken, scope: 'offline' },
    WHOOP_CLIENT_ID,
    WHOOP_CLIENT_SECRET
  );
  const tok = await r.json();
  if (!r.ok || !tok.access_token) {
    throw new Error(`Token refresh failed (${r.status}): ${JSON.stringify(tok)}. If this persists, re-run scripts/whoop-auth.mjs and update the WHOOP_REFRESH_TOKEN secret, then delete ${TOKEN_FILE}.`);
  }
  return tok;
}

async function fetchAll(accessToken, path) {
  const start = new Date(Date.now() - DAYS * 86400000).toISOString();
  const records = [];
  let nextToken;
  do {
    const u = new URL(BASE + path);
    u.searchParams.set('start', start);
    u.searchParams.set('limit', '25');
    if (nextToken) u.searchParams.set('nextToken', nextToken);
    const r = await fetch(u, { headers: { authorization: `Bearer ${accessToken}` } });
    if (r.status === 429) {
      const wait = +(r.headers.get('retry-after') || 30);
      console.log(`Rate limited, waiting ${wait}s…`);
      await new Promise((res) => setTimeout(res, wait * 1000));
      continue;
    }
    if (!r.ok) throw new Error(`GET ${path} failed (${r.status}): ${await r.text()}`);
    const page = await r.json();
    records.push(...(page.records || []));
    nextToken = page.next_token;
  } while (nextToken);
  return records;
}

/* Maps Whoop records to the site's per-day shape:
 * { recovery, hrv, rhr, sleepH, sleepPerf, strain } keyed by YYYY-MM-DD (UTC). */
export function mapRecords({ cycles, sleeps, recoveries }) {
  const days = {};
  const day = (iso) => iso && iso.slice(0, 10);
  const at = (k) => (days[k] = days[k] || {});

  const cycleDay = {};
  for (const c of cycles) {
    const k = day(c.start);
    if (!k) continue;
    cycleDay[c.id] = k;
    if (c.score_state === 'SCORED' && c.score?.strain !== undefined) {
      at(k).strain = +c.score.strain.toFixed(1);
    }
  }

  // keep the longest non-nap sleep per day (day sleeps after nights land on the day they end)
  const bestSleep = {};
  for (const s of sleeps) {
    if (s.nap || s.score_state !== 'SCORED' || !s.score) continue;
    const k = day(s.end);
    if (!k) continue;
    const st = s.score.stage_summary || {};
    const asleepMs =
      (st.total_light_sleep_time_milli || 0) +
      (st.total_rem_sleep_time_milli || 0) +
      (st.total_slow_wave_sleep_time_milli || 0);
    if (!bestSleep[k] || asleepMs > bestSleep[k].asleepMs) {
      bestSleep[k] = { asleepMs, perf: s.score.sleep_performance_percentage };
    }
  }
  for (const k in bestSleep) {
    at(k).sleepH = +(bestSleep[k].asleepMs / 3600000).toFixed(2);
    if (bestSleep[k].perf !== undefined && bestSleep[k].perf !== null) at(k).sleepPerf = Math.round(bestSleep[k].perf);
  }

  for (const r of recoveries) {
    if (r.score_state !== 'SCORED' || !r.score || r.score.user_calibrating) continue;
    const k = cycleDay[r.cycle_id];
    if (!k) continue;
    if (r.score.recovery_score !== undefined) at(k).recovery = Math.round(r.score.recovery_score);
    if (r.score.hrv_rmssd_milli !== undefined) at(k).hrv = Math.round(r.score.hrv_rmssd_milli);
    if (r.score.resting_heart_rate !== undefined) at(k).rhr = Math.round(r.score.resting_heart_rate);
  }

  return days;
}

async function main() {
  const tok = await refreshAccessToken(loadRefreshToken());

  fs.mkdirSync('data', { recursive: true });
  if (tok.refresh_token) fs.writeFileSync(TOKEN_FILE, encrypt(tok.refresh_token) + '\n');

  const [cycles, sleeps, recoveries] = [
    await fetchAll(tok.access_token, '/cycle'),
    await fetchAll(tok.access_token, '/activity/sleep'),
    await fetchAll(tok.access_token, '/recovery'),
  ];
  console.log(`Fetched ${cycles.length} cycles, ${sleeps.length} sleeps, ${recoveries.length} recoveries.`);

  const days = mapRecords({ cycles, sleeps, recoveries });
  fs.writeFileSync(OUT_FILE, JSON.stringify({ updated: new Date().toISOString(), source: 'whoop-api', days }, null, 1) + '\n');
  console.log(`Wrote ${OUT_FILE} with ${Object.keys(days).length} days.`);
}

if (process.argv[1] && process.argv[1].endsWith('whoop-sync.mjs')) {
  main().catch((e) => {
    console.error(e.message || e);
    process.exit(1);
  });
}
