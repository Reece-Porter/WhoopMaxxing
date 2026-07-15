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
- **Trend charts** (14/30/90 days) with hover tooltips and an accessible table view.
- **Recommendations**: rules that combine your rota position (first night, mid-nights, flip-back day, day shifts, rest days) with recovery colour, HRV/RHR deviation from baseline, sleep debt and strain-vs-recovery mismatch. Guidance only — not medical advice.

### 🍽️ Meal prep (`meals.html`)
- **Search by name** or **look up / camera-scan barcodes** against [Open Food Facts](https://world.openfoodfacts.org) (free, open database). MyFitnessPal shut down its public API, so it can't be linked directly — Open Food Facts is the open equivalent used by many macro apps.
- Camera scanning uses the browser's native `BarcodeDetector` (Chrome/Edge/Android); typing the barcode number works everywhere. Note: camera access requires HTTPS or `localhost`.
- Meal sections **adapt to that day's shift** (e.g. nights get *Pre-shift / Midnight / Post-shift / Snacks*).
- Adjustable gram portions, per-meal and per-day macro totals, progress bars against your daily calorie/protein/carb/fat targets, and a favourites list for foods you use often.

## Whoop API auto-sync setup (one-time, ~10 minutes)

Whoop's API uses OAuth with a client secret and blocks direct browser calls, so a static page can't talk to it directly. Instead, the included GitHub Action (`.github/workflows/whoop-sync.yml`) syncs for you on GitHub's servers — free, no hosting needed.

1. **Register an app** at [developer.whoop.com](https://developer.whoop.com) (log in with your normal Whoop account → create an app). Set the redirect URI to exactly `http://localhost:8789/callback`, and enable the scopes `read:recovery`, `read:sleep`, `read:cycles`, `read:profile` and `offline`. Copy the **Client ID** and **Client Secret**.

2. **Authorise once, on your own computer** (needs [Node.js](https://nodejs.org) installed):

   ```sh
   WHOOP_CLIENT_ID=your_id WHOOP_CLIENT_SECRET=your_secret node scripts/whoop-auth.mjs
   ```

   (On Windows PowerShell: `$env:WHOOP_CLIENT_ID="your_id"; $env:WHOOP_CLIENT_SECRET="your_secret"; node scripts/whoop-auth.mjs`.)
   Open the printed URL, log in to Whoop, approve — the script prints four values.

3. **Add the four repository secrets** on GitHub: *Settings → Secrets and variables → Actions → New repository secret*:
   `WHOOP_CLIENT_ID`, `WHOOP_CLIENT_SECRET`, `WHOOP_REFRESH_TOKEN`, `WHOOP_TOKEN_KEY` (all printed by step 2).

4. **Run it**: go to the *Actions* tab → *Whoop sync* → *Run workflow*. It commits `data/whoop.json` (your last 90 days) and from then on re-syncs every 3 hours automatically. The Whoop page shows "Auto-synced…" with the last sync time once it's working.

Notes:
- The scheduled run only fires on the repository's **default branch**, so merge this branch first (a manual *Run workflow* works on any branch).
- Whoop rotates refresh tokens on every use. The current token is stored encrypted in `data/whoop-token.enc` (AES-256-GCM, keyed by your `WHOOP_TOKEN_KEY` secret) and updated by each run — the `WHOOP_REFRESH_TOKEN` secret is only used the first time. If the sync ever breaks with a token error, re-run step 2 and update the `WHOOP_REFRESH_TOKEN` secret, then delete `data/whoop-token.enc`.
- Your Whoop stats end up in `data/whoop.json` in the repo — keep the repository **private** if you don't want them public.
- Synced days merge with (and overwrite) CSV/manual entries for the same date.

## Running locally

Any static server works, e.g.:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

Opening `index.html` directly from disk also works for everything except the camera scanner (which needs localhost/HTTPS).
