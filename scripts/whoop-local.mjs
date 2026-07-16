#!/usr/bin/env node
/* Local-first Whoop sync — runs on YOUR machine, nothing leaves it.
 * Tokens, raw records and derived data all live under data/ in this folder
 * (data/local and data/raw are gitignored so nothing is ever committed).
 *
 * Commands:
 *   node scripts/whoop-local.mjs auth     one-time browser login (needs client ID + secret once)
 *   node scripts/whoop-local.mjs sync     backfill on first run, incremental after
 *   node scripts/whoop-local.mjs status   what's stored locally
 *
 * Storage layout:
 *   data/local/config.json   client ID/secret            (chmod 600, gitignored)
 *   data/local/tokens.json   rotating refresh token      (chmod 600, gitignored)
 *   data/local/state.json    last sync watermark         (gitignored)
 *   data/raw/{cycles,sleeps,recoveries,workouts}.json    full untouched API records,
 *                            keyed by id — the archive to re-derive anything from later
 *   data/raw/{profile,body}.json                         profile + body measurements
 *   data/whoop.json          derived per-day metrics (what the site reads)
 *   data/workouts.json       derived per-workout rows (sport, zones, kcal, distance)
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import readline from 'node:readline/promises';
import { tokenRequest, fetchAll, mapRecords } from './whoop-sync.mjs';

const AUTH_URL = process.env.WHOOP_AUTH_URL || 'https://api.prod.whoop.com/oauth/oauth2/auth';
const TOKEN_URL = process.env.WHOOP_TOKEN_URL || 'https://api.prod.whoop.com/oauth/oauth2/token';
const BASE = process.env.WHOOP_API_BASE || 'https://api.prod.whoop.com/developer/v2';
const REDIRECT = 'http://localhost:8789/callback';
const SCOPE = 'offline read:recovery read:sleep read:cycles read:workout read:profile read:body_measurement';

const LOCAL = 'data/local';
const RAW = 'data/raw';
const FILES = {
  config: path.join(LOCAL, 'config.json'),
  tokens: path.join(LOCAL, 'tokens.json'),
  state: path.join(LOCAL, 'state.json'),
};
const BACKFILL_START = process.env.WHOOP_BACKFILL_START || '2015-01-01T00:00:00.000Z';
const OVERLAP_DAYS = 7; // re-fetch a window on incremental syncs so late-scored records update

const readJSON = (f, fallback) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : fallback);
function writeJSON(f, obj, secret = false) {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(obj, null, 1) + '\n');
  if (secret) fs.chmodSync(f, 0o600);
}

/* ---------- auth ---------- */
async function getConfig() {
  const cfg = readJSON(FILES.config, {});
  cfg.clientId = (process.env.WHOOP_CLIENT_ID || cfg.clientId || '').trim();
  cfg.clientSecret = (process.env.WHOOP_CLIENT_SECRET || cfg.clientSecret || '').trim();
  if (!cfg.clientId || !cfg.clientSecret) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    if (!cfg.clientId) cfg.clientId = (await rl.question('Whoop Client ID (the short UUID from developer.whoop.com): ')).trim();
    if (!cfg.clientSecret) cfg.clientSecret = (await rl.question('Whoop Client Secret (the long code — eye icon reveals it): ')).trim();
    rl.close();
  }
  if (!cfg.clientId || !cfg.clientSecret) {
    console.error('Client ID and secret are required.');
    process.exit(1);
  }
  writeJSON(FILES.config, { clientId: cfg.clientId, clientSecret: cfg.clientSecret }, true);
  return cfg;
}

async function cmdAuth() {
  const cfg = await getConfig();
  const state = crypto.randomBytes(8).toString('hex');
  const url =
    `${AUTH_URL}?response_type=code&client_id=${encodeURIComponent(cfg.clientId)}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT)}&scope=${encodeURIComponent(SCOPE)}&state=${state}`;

  const code = await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const u = new URL(req.url, 'http://localhost:8789');
      if (u.pathname !== '/callback') { res.writeHead(404).end(); return; }
      if (u.searchParams.get('state') !== state || !u.searchParams.get('code')) {
        res.writeHead(400, { 'content-type': 'text/plain' }).end('State mismatch or missing code — run auth again.');
        return;
      }
      res.writeHead(200, { 'content-type': 'text/plain' }).end('Authorised — you can close this tab and go back to the terminal.');
      server.close();
      resolve(u.searchParams.get('code'));
    });
    server.on('error', reject);
    server.listen(8789, () => {
      console.log('\nOpen this URL in your browser and approve access:\n\n' + url + '\n\nWaiting on http://localhost:8789 …');
    });
  });

  const r = await tokenRequest(TOKEN_URL, { grant_type: 'authorization_code', code, redirect_uri: REDIRECT }, cfg.clientId, cfg.clientSecret);
  const tok = await r.json().catch(() => ({}));
  if (!r.ok || !tok.refresh_token) {
    console.error(`Token exchange failed (${r.status}): ${JSON.stringify(tok)}`);
    console.error('Check the app on developer.whoop.com has ALL these scopes enabled: ' + SCOPE);
    process.exit(1);
  }
  writeJSON(FILES.tokens, { refresh_token: tok.refresh_token, obtained: new Date().toISOString() }, true);
  console.log(`✅ Authorised. Tokens stored in ${FILES.tokens} (this machine only). Now run: node scripts/whoop-local.mjs sync`);
}

/* Refresh access token; Whoop rotates the refresh token so persist the new one. */
async function getAccessToken(cfg) {
  const tokens = readJSON(FILES.tokens, null);
  if (!tokens?.refresh_token) {
    console.error('Not authorised yet — run: node scripts/whoop-local.mjs auth');
    process.exit(1);
  }
  const r = await tokenRequest(
    TOKEN_URL,
    { grant_type: 'refresh_token', refresh_token: tokens.refresh_token, scope: 'offline' },
    cfg.clientId,
    cfg.clientSecret
  );
  const tok = await r.json().catch(() => ({}));
  if (!r.ok || !tok.access_token) {
    throw new Error(`Token refresh failed (${r.status}): ${JSON.stringify(tok)} — if this persists, run auth again.`);
  }
  if (tok.refresh_token) {
    writeJSON(FILES.tokens, { refresh_token: tok.refresh_token, obtained: new Date().toISOString() }, true);
  }
  return tok.access_token;
}

/* ---------- sync ---------- */
async function fetchSingle(accessToken, apiPath) {
  const r = await fetch(BASE + apiPath, { headers: { authorization: `Bearer ${accessToken}` } });
  if (!r.ok) throw new Error(`GET ${apiPath} failed (${r.status})`);
  return r.json();
}

/* Merge fetched records into the raw archive (a JSON object keyed by id),
 * so incremental syncs dedupe and re-scored records overwrite old versions. */
function mergeRaw(name, records, idOf) {
  const file = path.join(RAW, name + '.json');
  const map = readJSON(file, {});
  let added = 0, updated = 0;
  for (const rec of records) {
    const id = idOf(rec);
    if (id === undefined || id === null) continue;
    if (map[id]) updated++; else added++;
    map[id] = rec;
  }
  writeJSON(file, map);
  return { total: Object.keys(map).length, added, updated };
}

function deriveWorkouts(workoutMap) {
  const rows = Object.values(workoutMap)
    .filter((w) => w.score_state === 'SCORED' && w.score)
    .map((w) => {
      const z = w.score.zone_durations || w.score.zone_duration || {};
      const zoneMin = {};
      for (let i = 0; i <= 5; i++) {
        const ms = z[`zone_${['zero', 'one', 'two', 'three', 'four', 'five'][i]}_milli`];
        if (ms !== undefined) zoneMin['z' + i] = Math.round(ms / 60000);
      }
      return {
        id: w.id,
        date: (w.start || '').slice(0, 10),
        start: w.start,
        end: w.end,
        sport: w.sport_name || (w.sport_id !== undefined ? `sport ${w.sport_id}` : 'unknown'),
        durationMin: w.start && w.end ? Math.round((new Date(w.end) - new Date(w.start)) / 60000) : undefined,
        strain: w.score.strain !== undefined ? +w.score.strain.toFixed(1) : undefined,
        avgHR: w.score.average_heart_rate,
        maxHR: w.score.max_heart_rate,
        kcal: w.score.kilojoule ? Math.round(w.score.kilojoule / 4.184) : undefined,
        distanceKm: w.score.distance_meter ? +(w.score.distance_meter / 1000).toFixed(2) : undefined,
        zoneMin,
      };
    })
    .sort((a, b) => (a.start < b.start ? 1 : -1));
  return rows;
}

async function cmdSync() {
  const cfg = await getConfig();
  const accessToken = await getAccessToken(cfg);
  const state = readJSON(FILES.state, {});
  const start = state.lastSync
    ? new Date(new Date(state.lastSync) - OVERLAP_DAYS * 86400000).toISOString()
    : BACKFILL_START;
  console.log(state.lastSync ? `Incremental sync since ${start} (last sync ${state.lastSync})` : `First run — backfilling from ${start}`);

  const plan = [
    ['cycles', '/cycle', (r) => r.id],
    ['sleeps', '/activity/sleep', (r) => r.id],
    ['recoveries', '/recovery', (r) => r.cycle_id],
    ['workouts', '/activity/workout', (r) => r.id],
  ];
  const raw = {};
  for (const [name, apiPath, idOf] of plan) {
    try {
      const records = await fetchAll(accessToken, apiPath, { base: BASE, start });
      const res = mergeRaw(name, records, idOf);
      raw[name] = readJSON(path.join(RAW, name + '.json'), {});
      console.log(`${name}: fetched ${records.length} (${res.added} new, ${res.updated} updated) — ${res.total} archived`);
    } catch (e) {
      if (String(e.message).includes('(403)')) {
        console.warn(`${name}: skipped — the app is missing this scope on developer.whoop.com (${e.message}). Enable it and run auth again.`);
        raw[name] = readJSON(path.join(RAW, name + '.json'), {});
      } else throw e;
    }
  }

  // profile + body measurements (single objects, nice-to-have)
  for (const [name, apiPath] of [['profile', '/user/profile/basic'], ['body', '/user/measurement/body']]) {
    try {
      writeJSON(path.join(RAW, name + '.json'), await fetchSingle(accessToken, apiPath));
      console.log(`${name}: updated`);
    } catch (e) {
      console.warn(`${name}: skipped (${e.message})`);
    }
  }

  // derive the files the site reads — from the FULL archive, so history accumulates
  const days = mapRecords({
    cycles: Object.values(raw.cycles || {}),
    sleeps: Object.values(raw.sleeps || {}),
    recoveries: Object.values(raw.recoveries || {}),
  });
  writeJSON('data/whoop.json', { updated: new Date().toISOString(), source: 'whoop-local', days });
  const workouts = deriveWorkouts(raw.workouts || {});
  writeJSON('data/workouts.json', { updated: new Date().toISOString(), workouts });

  writeJSON(FILES.state, { lastSync: new Date().toISOString() });
  console.log(`\n✅ data/whoop.json: ${Object.keys(days).length} days · data/workouts.json: ${workouts.length} workouts`);
  console.log('Serve the site locally to view it:  python3 -m http.server 8000  →  http://localhost:8000/whoop.html');
}

/* ---------- status ---------- */
function cmdStatus() {
  const state = readJSON(FILES.state, {});
  console.log('Last sync:', state.lastSync || 'never');
  for (const name of ['cycles', 'sleeps', 'recoveries', 'workouts']) {
    const map = readJSON(path.join(RAW, name + '.json'), {});
    console.log(`${name}: ${Object.keys(map).length} records archived`);
  }
  const daysFile = readJSON('data/whoop.json', null);
  if (daysFile?.days) {
    const keys = Object.keys(daysFile.days).sort();
    console.log(`derived days: ${keys.length} (${keys[0]} → ${keys[keys.length - 1]}), source: ${daysFile.source || '?'}`);
  }
}

const cmd = process.argv[2];
if (cmd === 'auth') await cmdAuth();
else if (cmd === 'sync') await cmdSync();
else if (cmd === 'status') cmdStatus();
else {
  console.log('Usage: node scripts/whoop-local.mjs <auth|sync|status>');
  process.exit(cmd ? 1 : 0);
}
