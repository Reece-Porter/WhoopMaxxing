# ShiftMaxx

A self-contained site for maximising efficiency on a shift-work rota: your rota calendar, a Whoop data dashboard with shift-aware recommendations, and a meal-prep planner with barcode/name food lookup.

No build step, no server, no accounts. Open `index.html` in a browser, or host the folder on GitHub Pages / any static host. All personal data (Whoop stats, meal plans, targets, favourites) is stored in your browser's localStorage and never leaves your device — the only network calls are food lookups to Open Food Facts.

## Pages

### 📅 Rota (`rota.html`)
Full month calendar of the **4 nights → 4 off → 4 days → 4 off** cycle (16 days), anchored so the first night shift is **19 July 2026**. Nights run 19:00–07:00, days 07:00–19:00. Each cell shows which day of the block you're on (e.g. `NIGHT 2/4`).

To change the pattern, start date or shift times, edit the `ROTA` object at the top of `assets/js/shifts.js`.

### 📈 Whoop (`whoop.html`)
- **Import**: in the Whoop app go to *More → App settings → Data export*, then upload the `physiological_cycles.csv` from the emailed zip. Re-importing merges/updates days. (Whoop's live API requires a registered OAuth developer app, so the export route keeps this site serverless and key-free.)
- **Manual entry** for logging a day quickly.
- **Stat tiles** for recovery, HRV and resting HR (vs your 14-day average), sleep and strain.
- **Trend charts** (14/30/90 days) with hover tooltips and an accessible table view.
- **Recommendations**: rules that combine your rota position (first night, mid-nights, flip-back day, day shifts, rest days) with recovery colour, HRV/RHR deviation from baseline, sleep debt and strain-vs-recovery mismatch. Guidance only — not medical advice.

### 🍽️ Meal prep (`meals.html`)
- **Search by name** or **look up / camera-scan barcodes** against [Open Food Facts](https://world.openfoodfacts.org) (free, open database). MyFitnessPal shut down its public API, so it can't be linked directly — Open Food Facts is the open equivalent used by many macro apps.
- Camera scanning uses the browser's native `BarcodeDetector` (Chrome/Edge/Android); typing the barcode number works everywhere. Note: camera access requires HTTPS or `localhost`.
- Meal sections **adapt to that day's shift** (e.g. nights get *Pre-shift / Midnight / Post-shift / Snacks*).
- Adjustable gram portions, per-meal and per-day macro totals, progress bars against your daily calorie/protein/carb/fat targets, and a favourites list for foods you use often.

## Running locally

Any static server works, e.g.:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

Opening `index.html` directly from disk also works for everything except the camera scanner (which needs localhost/HTTPS).
