/* Whoop dashboard: CSV import (Whoop app export), manual entry, trends and
 * shift-aware recommendations. All data stays in this browser (localStorage). */
(function () {
  const FIELDS = {
    recovery: { label: 'Recovery', unit: '%', color: 'var(--c-blue)', min: 0, max: 100 },
    hrv: { label: 'HRV', unit: 'ms', color: 'var(--c-aqua)' },
    rhr: { label: 'Resting HR', unit: 'bpm', color: 'var(--c-magenta)' },
    sleepH: { label: 'Sleep', unit: 'h', color: 'var(--c-violet)' },
    strain: { label: 'Day strain', unit: '', color: 'var(--c-yellow)', min: 0, max: 21 },
  };

  /* ---------- CSV import ---------- */
  function parseCSV(text) {
    const rows = [];
    let row = [], cur = '', inQ = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQ) {
        if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') inQ = false;
        else cur += ch;
      } else if (ch === '"') inQ = true;
      else if (ch === ',') { row.push(cur); cur = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (cur !== '' || row.length) { row.push(cur); rows.push(row); row = []; cur = ''; }
        if (ch === '\r' && text[i + 1] === '\n') i++;
      } else cur += ch;
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    return rows;
  }

  // Column matchers for Whoop's physiological_cycles.csv (headers vary by export version)
  const COLS = {
    date: /cycle start|^date$|^day$/i,
    recovery: /recovery score/i,
    rhr: /resting heart rate/i,
    hrv: /heart rate variability/i,
    sleepMin: /asleep duration/i,
    sleepPerf: /sleep performance/i,
    strain: /day strain|^strain$/i,
  };

  function importCSV(text) {
    const rows = parseCSV(text);
    if (rows.length < 2) return { imported: 0 };
    const header = rows[0];
    const idx = {};
    for (const key in COLS) {
      idx[key] = header.findIndex((h) => COLS[key].test(h));
    }
    if (idx.date === -1) return { error: 'Could not find a date column — is this the Whoop physiological_cycles.csv export?' };

    const data = getWhoopData();
    let imported = 0;
    for (const row of rows.slice(1)) {
      const rawDate = row[idx.date];
      if (!rawDate) continue;
      const d = new Date(rawDate.replace(' ', 'T'));
      if (isNaN(d)) continue;
      const key = dateKey(d);
      const num = (i) => (i >= 0 && row[i] !== '' && !isNaN(+row[i]) ? +row[i] : undefined);
      const rec = {
        recovery: num(idx.recovery),
        rhr: num(idx.rhr),
        hrv: num(idx.hrv),
        sleepPerf: num(idx.sleepPerf),
        strain: idx.strain >= 0 && row[idx.strain] !== '' ? +(+row[idx.strain]).toFixed(1) : undefined,
        sleepH: num(idx.sleepMin) !== undefined ? +(num(idx.sleepMin) / 60).toFixed(2) : undefined,
      };
      const clean = {};
      for (const k in rec) if (rec[k] !== undefined) clean[k] = rec[k];
      if (Object.keys(clean).length === 0) continue;
      data[key] = { ...(data[key] || {}), ...clean };
      imported++;
    }
    setWhoopData(data);
    return { imported };
  }

  /* ---------- derived stats ---------- */
  function sortedEntries() {
    const data = getWhoopData();
    return Object.keys(data).sort().map((key) => ({ key, ...data[key] }));
  }

  function series(entries, field, days) {
    const cutoff = dateKey(addDays(new Date(), -days));
    return entries
      .filter((e) => e.key >= cutoff && e[field] !== undefined)
      .map((e) => ({ key: e.key, value: e[field] }));
  }

  function baseline(entries, field, days, excludeKey) {
    const vals = series(entries, field, days).filter((p) => p.key !== excludeKey).map((p) => p.value);
    if (!vals.length) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }

  /* ---------- stat tiles ---------- */
  function recoveryStatus(r) {
    if (r >= 67) return { cls: 'good', icon: '✅', word: 'Green — well recovered' };
    if (r >= 34) return { cls: 'warning', icon: '⚠️', word: 'Yellow — moderate' };
    return { cls: 'critical', icon: '⛔', word: 'Red — run down' };
  }

  function renderTiles(entries) {
    const wrap = document.getElementById('tiles');
    wrap.innerHTML = '';
    if (!entries.length) return;
    const latest = entries[entries.length - 1];
    const latestDate = parseKey(latest.key).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
    document.getElementById('latest-date').textContent = `Latest data: ${latestDate}`;

    const tiles = [];
    if (latest.recovery !== undefined) {
      const st = recoveryStatus(latest.recovery);
      tiles.push({ label: 'Recovery', value: `${latest.recovery}<small>%</small>`, delta: `${st.icon} ${st.word}` });
    }
    for (const [field, dir] of [['hrv', 'up'], ['rhr', 'down']]) {
      if (latest[field] === undefined) continue;
      const base = baseline(entries, field, 14, latest.key);
      let delta = '';
      let cls = '';
      if (base) {
        const pct = ((latest[field] - base) / base) * 100;
        const goodWhen = dir === 'up' ? pct >= 0 : pct <= 0;
        cls = goodWhen ? 'up' : 'down';
        delta = `${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct).toFixed(1)}% vs 14-day avg`;
      }
      tiles.push({ label: FIELDS[field].label, value: `${latest[field]}<small> ${FIELDS[field].unit}</small>`, delta, cls });
    }
    if (latest.sleepH !== undefined) {
      const h = Math.floor(latest.sleepH);
      const m = Math.round((latest.sleepH - h) * 60);
      tiles.push({ label: 'Sleep', value: `${h}<small>h</small> ${m}<small>m</small>`, delta: latest.sleepPerf !== undefined ? `${latest.sleepPerf}% sleep performance` : '' });
    }
    if (latest.strain !== undefined) {
      tiles.push({ label: 'Day strain', value: `${latest.strain}`, delta: 'scale 0–21' });
    }

    for (const t of tiles) {
      const div = document.createElement('div');
      div.className = 'card tile';
      div.innerHTML = `<div class="label">${t.label}</div><div class="value">${t.value}</div><div class="delta ${t.cls || ''}">${t.delta || ''}</div>`;
      wrap.appendChild(div);
    }
  }

  /* ---------- recommendations ---------- */
  function recommendations(entries) {
    const recs = [];
    const now = new Date();
    const today = shiftFor(now);
    const tomorrow = shiftFor(addDays(now, 1));
    const latest = entries.length ? entries[entries.length - 1] : null;

    // Shift-timing advice (always available — driven by the rota alone)
    if (today.code === 'N') {
      if (today.run === 1) {
        recs.push(['info', '🌙', 'First night shift tonight', 'Sleep in as late as you can this morning and take a 90–120 minute nap between 14:00 and 17:00. Save caffeine for the start of the shift and cut it off 6+ hours before your morning bedtime.']);
      } else if (today.run === today.runLength) {
        recs.push(['info', '🌙', `Last night shift tonight (${today.run} of ${today.runLength})`, 'Tomorrow morning, sleep a short 90 min–3 h block instead of a full day sleep, get bright daylight in the afternoon, then an early normal night — that flips you back to days fastest.']);
      } else {
        recs.push(['info', '🌙', `Night ${today.run} of ${today.runLength}`, 'Protect your day sleep: blackout, phone on do-not-disturb, one continuous block starting within an hour of getting home. Eat your main meal before the shift, keep food between midnight and 06:00 light.']);
      }
    } else if (today.code === 'D') {
      recs.push(['info', '☀️', `Day shift ${today.run} of ${today.runLength} (07:00–19:00)`, 'Aim for lights out by 22:00 to bank 8 h before the alarm. Caffeine before noon only. Get daylight on your commute to keep your body clock anchored.']);
    } else {
      const yesterday = shiftFor(addDays(now, -1));
      if (yesterday.code === 'N') {
        recs.push(['info', '🛌', 'First rest day after nights', 'Short morning sleep, not a full day — then push through to a normal early bedtime tonight. Daylight and a walk this afternoon speed the reset.']);
      }
      if (tomorrow.code !== 'O') {
        const t = tomorrow.code === 'N' ? 'nights' : 'days';
        recs.push(['info', '📅', `Back on ${t} tomorrow`, tomorrow.code === 'N' ? 'Stay up late tonight and lie in tomorrow to pre-shift your clock for the first night.' : 'Early night tonight — you are up before 06:00 tomorrow.']);
      } else {
        recs.push(['good', '✅', `Rest day ${today.run} of ${today.runLength}`, 'Keep sleep and meals near normal daytime hours so your baseline recovers before the next block.']);
      }
    }

    if (!latest) {
      recs.push(['warning', '📥', 'No Whoop data yet', 'Import your Whoop CSV export or add a manual entry above to unlock recovery-based recommendations.']);
      return recs;
    }

    // Recovery-driven training advice
    if (latest.recovery !== undefined) {
      const onShift = today.code !== 'O';
      if (latest.recovery >= 67) {
        recs.push(['good', '💪', `Recovery ${latest.recovery}% — green`, onShift ? 'You can handle a proper session today, but schedule it before a day shift or before sleep prep on nights — not right after a 12-hour shift.' : 'Great day for your hardest training of the week.']);
      } else if (latest.recovery >= 34) {
        recs.push(['warning', '🟡', `Recovery ${latest.recovery}% — moderate`, 'Keep training to zone 2 cardio or light weights. Prioritise sleep quantity tonight over an extra session.']);
      } else {
        recs.push(['critical', '🔴', `Recovery ${latest.recovery}% — red`, onShift ? 'Skip training. On shift: hydrate, eat properly, and get to bed the moment you are home. Red recoveries stack fast on this rota.' : 'Full rest day: no training, extra sleep, easy food. Let the body catch up before the next block.']);
      }
    }

    // HRV vs baseline
    const hrvBase = baseline(entries, 'hrv', 14, latest.key);
    if (latest.hrv !== undefined && hrvBase) {
      const pct = ((latest.hrv - hrvBase) / hrvBase) * 100;
      if (pct <= -10) recs.push(['serious', '📉', `HRV ${Math.abs(pct).toFixed(0)}% below your 14-day average`, 'Your nervous system is under load — common mid-nights. Drop training intensity, front-load protein and fluids, and guard your next sleep window.']);
    }

    // RHR vs baseline
    const rhrBase = baseline(entries, 'rhr', 14, latest.key);
    if (latest.rhr !== undefined && rhrBase) {
      const pct = ((latest.rhr - rhrBase) / rhrBase) * 100;
      if (pct >= 5) recs.push(['serious', '❤️', `Resting HR ${pct.toFixed(0)}% above your 14-day average`, 'Elevated RHR can signal poor sleep, dehydration or oncoming illness. Ease off caffeine and alcohol, hydrate, and watch tomorrow\'s reading.']);
    }

    // Sleep debt over the last 4 days
    const recent = series(entries, 'sleepH', 4);
    if (recent.length >= 3) {
      const avg = recent.reduce((a, b) => a + b.value, 0) / recent.length;
      if (avg < 6.5) {
        recs.push(['serious', '😴', `Averaging ${avg.toFixed(1)} h sleep over the last ${recent.length} days`, today.code === 'N' ? 'You are building sleep debt mid-nights. Add a 30–90 min nap before tonight\'s shift and treat day sleep as non-negotiable.' : 'Bank extra sleep tonight and consider an afternoon nap — pay the debt down before the next shift block.']);
      }
    }

    // Strain vs recovery mismatch (yesterday's strain vs today's recovery)
    if (entries.length >= 2) {
      const prev = entries[entries.length - 2];
      if (prev.strain !== undefined && latest.recovery !== undefined && prev.strain >= 14 && latest.recovery < 50) {
        recs.push(['warning', '⚖️', 'High strain is outpacing recovery', `Yesterday's strain was ${prev.strain} but recovery came back at ${latest.recovery}%. On a 4-on-4-off rota, save the big efforts for your off days.`]);
      }
    }

    return recs;
  }

  function renderRecs(entries) {
    const wrap = document.getElementById('recs');
    wrap.innerHTML = '';
    for (const [cls, icon, title, body] of recommendations(entries)) {
      const div = document.createElement('div');
      div.className = `rec ${cls}`;
      div.innerHTML = `<div class="icon">${icon}</div><div><h4>${title}</h4><p>${body}</p></div>`;
      wrap.appendChild(div);
    }
  }

  /* ---------- charts ---------- */
  function renderCharts(entries) {
    const days = +document.getElementById('range').value;
    for (const field in FIELDS) {
      const f = FIELDS[field];
      renderLineChart(document.getElementById(`chart-${field}`), {
        title: f.label,
        unit: f.unit,
        color: f.color,
        data: series(entries, field, days),
        yMin: f.min,
        yMax: f.max,
      });
    }
  }

  function refresh() {
    const entries = sortedEntries();
    renderTiles(entries);
    renderRecs(entries);
    renderCharts(entries);
    document.getElementById('entry-count').textContent = entries.length
      ? `${entries.length} days of data stored in this browser.`
      : 'No data stored yet.';
  }

  /* ---------- wiring ---------- */
  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('csv-file').addEventListener('change', async (ev) => {
      const file = ev.target.files[0];
      if (!file) return;
      const res = importCSV(await file.text());
      const msg = document.getElementById('import-msg');
      if (res.error) {
        msg.textContent = res.error;
        msg.className = 'error-text';
      } else {
        msg.textContent = `Imported ${res.imported} rows.`;
        msg.className = 'notice';
      }
      ev.target.value = '';
      refresh();
    });

    const form = document.getElementById('manual-form');
    form.date.value = dateKey(new Date());
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const data = getWhoopData();
      const rec = {};
      for (const f of ['recovery', 'hrv', 'rhr', 'sleepH', 'sleepPerf', 'strain']) {
        if (form[f].value !== '') rec[f] = +form[f].value;
      }
      if (!form.date.value || Object.keys(rec).length === 0) return;
      data[form.date.value] = { ...(data[form.date.value] || {}), ...rec };
      setWhoopData(data);
      form.reset();
      form.date.value = dateKey(new Date());
      refresh();
    });

    document.getElementById('range').addEventListener('change', refresh);

    document.getElementById('clear-data').addEventListener('click', () => {
      if (confirm('Delete all stored Whoop data from this browser?')) {
        setWhoopData({});
        refresh();
      }
    });

    refresh();

    // Merge in API-synced data if the Whoop-sync workflow is set up
    loadRepoWhoopData().then((updated) => {
      if (!updated) return;
      const el = document.getElementById('sync-status');
      if (el) {
        el.textContent = `🔄 Auto-synced from the Whoop API — last sync ${new Date(updated).toLocaleString()}.`;
      }
      refresh();
    });
  });
})();
