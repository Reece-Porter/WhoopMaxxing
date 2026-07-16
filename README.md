# ShiftMaxx

A self-contained site for maximising efficiency on a shift-work rota: your rota calendar, a Whoop data dashboard with shift-aware recommendations, and a meal-prep planner with barcode/name food lookup.

No build step, no server, no accounts. Open `index.html` in a browser, or host the folder on GitHub Pages / any static host. All personal data (Whoop stats, meal plans, targets, favourites) is stored in your browser's localStorage and never leaves your device — the only network calls are food lookups to Open Food Facts.

## Pages

### 📅 Rota (`rota.html`)
Full month calendar of the **4 nights → 4 off → 4 days → 4 off** cycle (16 days), anchored so the first night shift is **19 July 2026**. Nights run 19:00–07:00, days 07:00–19:00. Each cell shows which day of the block you're on (e.g. `NIGHT 2/4`).

To change the pattern, start date or shift times, edit the `ROTA` object at the top of `assets/js/shifts.js`.

### 📈 Whoop (`whoop.html`)
- **Auto-sync (recommended)**: a GitHub Action pulls your data from the official Whoop API every 3 hours and commits it to `data/whoop.json`, which the site loads automatically. Setup steps below.
- **Import**: in the Whoop app go to *More → App settings → Data export*, then upload the `physiological_cycles.csv` from the emailed zip. Re-importing merges/updates days.
- **Manual entry** for logging a day quickly.
- **Stat tiles** for recovery, HRV and resting HR (vs your 14-day average), sleep and strain.
- **Trend charts** (14/30/90 days) for **every metric Whoop exposes** — recovery, HRV, resting HR, blood oxygen, skin temp, sleep duration/need/performance/consistency/efficiency, REM/deep/light/awake, disturbances, respiratory rate, strain, calories, average/max HR — with hover tooltips and an accessible table view.
- **Today's plan**: rules that combine your rota position (first night, mid-nights, flip-back day, day shifts, rest days) with recovery colour, HRV/RHR deviation from baseline, sleep debt and strain-vs-recovery mismatch.
- **How to improve each score**: your latest value for every metric, judged against healthy ranges or your own 14-day average, with the specific levers that move it — tuned for shift work. Guidance only — not medical advice.

### 🍽️ Meal prep (`meals.html`)
- **Search by name** or **look up / camera-scan barcodes** against [Open Food Facts](https://world.openfoodfacts.org) (free, open database). MyFitnessPal shut down its public API, so it can't be linked directly — Open Food Facts is the open equivalent used by many macro apps.
- Camera scanning uses the browser's native `BarcodeDetector` (Chrome/Edge/Android); typing the barcode number works everywhere. Note: camera access requires HTTPS or `localhost`.
- Meal sections **adapt to that day's shift** (e.g. nights get *Pre-shift / Midnight / Post-shift / Snacks*).
- Adjustable gram portions, per-meal and per-day macro totals, progress bars against your daily calorie/protein/carb/fat targets, and a favourites list for foods you use often.

## Local-first sync (everything stays on your machine)

For NHS-style data handling — no third-party storage, tokens and health data never leave your computer — use the local CLI instead of (or alongside) the GitHub Actions sync. Needs [Node.js](https://nodejs.org) 18+.

```sh
node scripts/whoop-local.mjs auth     # one-time browser login (asks for client ID + secret once)
node scripts/whoop-local.mjs sync     # backfills your full history on first run, incremental after
node scripts/whoop-local.mjs status   # what's stored locally
```

Before the first `auth`, make sure your app on developer.whoop.com has **all** of these scopes enabled: `read:recovery read:sleep read:cycles read:workout read:profile read:body_measurement offline` (the local CLI also pulls per-workout data, which the Actions sync doesn't).

Storage layout (two layers, flat JSON — trivially greppable, and a clean upgrade path to SQLite later by importing the raw archive):

| Path | Contents | Committed? |
|---|---|---|
| `data/local/config.json`, `tokens.json`, `state.json` | client credentials, rotating refresh token (auto-refreshed on every sync — no re-authenticating), sync watermark | never (gitignored, chmod 600) |
| `data/raw/{cycles,sleeps,recoveries,workouts}.json` | every API record untouched, keyed by id — dedupes on incremental syncs, re-scored records overwrite | never (gitignored) |
| `data/raw/{profile,body}.json` | profile + body measurements | never (gitignored) |
| `data/whoop.json` | derived per-day metrics — what the site reads | your choice |
| `data/workouts.json` | derived per-workout rows: sport, duration, strain, avg/max HR, HR-zone minutes, kcal, distance | your choice |

Incremental syncs re-fetch a 7-day overlap window so late-scored sleeps/recoveries get corrected. To view the site with local data: `python3 -m http.server 8000` → `http://localhost:8000`. Run `sync` daily (or add a cron/Task Scheduler entry on your machine).

Note: the GitHub Actions sync (below) commits `data/whoop.json` and an encrypted token to the repo — convenient for phone access, but your stats live in GitHub. Pick the mode that matches your comfort level; both write the same `data/whoop.json` the site reads. If you go fully local, disable the *Whoop sync* workflow (Actions → Whoop sync → ⋯ → Disable workflow).

## Whoop API auto-sync setup (one-time, ~10 minutes)

Whoop's API uses OAuth with a client secret and blocks direct browser calls, so a static page can't talk to it directly. Instead, the included GitHub Action (`.github/workflows/whoop-sync.yml`) syncs for you on GitHub's servers — free, no hosting needed.

Everything happens in your browser and on GitHub — **nothing to install**. (`whoop-connect.html` on the site walks you through the same steps interactively.)

1. **Register an app** at [developer.whoop.com](https://developer.whoop.com) (log in with your normal Whoop account → create an app). Set the redirect URI to exactly `http://localhost:8789/callback`, and enable the scopes `read:recovery`, `read:sleep`, `read:cycles`, `read:profile` and `offline`. Copy the **Client ID** and **Client Secret**.

2. **Add three repository secrets** on GitHub: *Settings → Secrets and variables → Actions → New repository secret*:
   - `WHOOP_CLIENT_ID` and `WHOOP_CLIENT_SECRET` — from step 1
   - `WHOOP_TOKEN_KEY` — make up any long random password (it encrypts your token in the repo)

3. **Log in to Whoop**: open the site's **Connect Whoop** page (`whoop-connect.html`), enter your Client ID and click *Open Whoop login*, then approve access. You'll land on a **broken `localhost` page — that's expected**: the one-time code is in the address bar. Copy the full URL.

4. **Run the authorise workflow**: repo → *Actions* tab → **Whoop authorise** → *Run workflow* → paste the URL you copied → run. Do steps 3–4 within a few minutes (codes expire fast). The workflow exchanges the code on GitHub's servers, stores the token encrypted, and runs your first sync.

Done — `data/whoop.json` (your last 90 days) is committed and the **Whoop sync** workflow re-syncs every 3 hours from then on. The Whoop page shows "Auto-synced…" with the last sync time once it's working.

Notes:
- The scheduled run only fires on the repository's **default branch**, so merge this branch first (manual *Run workflow* works on any branch).
- Whoop rotates refresh tokens on every use. The current token is stored encrypted in `data/whoop-token.enc` (AES-256-GCM, keyed by your `WHOOP_TOKEN_KEY` secret) and updated by each run. If the sync ever breaks with a token error, just repeat steps 3–4.
- Your Whoop stats end up in `data/whoop.json` in the repo — keep the repository **private** if you don't want them public. (The pasted auth code is visible in the workflow run log, but it's single-use and expires in minutes.)
- Synced days merge with (and overwrite) CSV/manual entries for the same date.
- Prefer the terminal? `scripts/whoop-auth.mjs` still exists: run it locally with Node, add the printed `WHOOP_REFRESH_TOKEN` secret, and trigger *Whoop sync* directly.

## Running locally

Any static server works, e.g.:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

Opening `index.html` directly from disk also works for everything except the camera scanner (which needs localhost/HTTPS).
