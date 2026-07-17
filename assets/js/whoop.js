/* Whoop dashboard: API auto-sync + CSV import + manual entry, a chart for
 * every metric Whoop exposes, and per-metric improvement guidance.
 * All data stays in this browser (localStorage). */
(function () {
  /* Every per-day metric in four categories. Each category owns ONE identity
   * colour, used for all of its charts here and everywhere else in the app. */
  const GROUPS = [
    {
      key: 'recovery', title: 'Recovery', icon: 'activity', color: 'var(--m-recovery)',
      metrics: [
        { key: 'recovery', label: 'Recovery', unit: '%', min: 0, max: 100 },
        { key: 'hrv', label: 'HRV', unit: 'ms' },
        { key: 'rhr', label: 'Resting HR', unit: 'bpm' },
      ],
    },
    {
      key: 'sleep', title: 'Sleep', icon: 'bed', color: 'var(--m-sleep)',
      metrics: [
        { key: 'sleepH', label: 'Sleep', unit: 'h' },
        { key: 'sleepNeedH', label: 'Sleep need', unit: 'h' },
        { key: 'sleepPerf', label: 'Sleep performance', unit: '%', min: 0, max: 100 },
        { key: 'sleepConsistency', label: 'Sleep consistency', unit: '%', min: 0, max: 100 },
        { key: 'sleepEfficiency', label: 'Sleep efficiency', unit: '%', min: 0, max: 100 },
        { key: 'remH', label: 'REM sleep', unit: 'h' },
        { key: 'deepH', label: 'Deep (SWS) sleep', unit: 'h' },
        { key: 'lightH', label: 'Light sleep', unit: 'h' },
        { key: 'awakeH', label: 'Awake in bed', unit: 'h' },
        { key: 'disturbances', label: 'Disturbances', unit: '' },
      ],
    },
    {
      key: 'strain', title: 'Strain & training', icon: 'flame', color: 'var(--m-strain)',
      metrics: [
        { key: 'strain', label: 'Day strain', unit: '', min: 0, max: 21 },
        { key: 'calories', label: 'Energy burned', unit: 'kcal' },
        { key: 'avgHR', label: 'Average HR', unit: 'bpm' },
        { key: 'maxHR', label: 'Max HR', unit: 'bpm' },
      ],
    },
    {
      key: 'vitals', title: 'Vitals', icon: 'heart', color: 'var(--m-vitals)',
      metrics: [
        { key: 'spo2', label: 'Blood oxygen', unit: '%' },
        { key: 'skinTemp', label: 'Skin temp', unit: '°C' },
        { key: 'respRate', label: 'Respiratory rate', unit: 'rpm' },
      ],
    },
  ];
  const ALL_METRICS = GROUPS.flatMap((g) => g.metrics.map((m) => ({ ...m, color: g.color })));

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

  // Column matchers for Whoop's physiological_cycles.csv. min: true → minutes → hours.
  const COLS = [
    { re: /recovery score/i, field: 'recovery' },
    { re: /resting heart rate/i, field: 'rhr' },
    { re: /heart rate variability/i, field: 'hrv' },
    { re: /blood oxygen/i, field: 'spo2', dp: 1 },
    { re: /skin temp/i, field: 'skinTemp', dp: 1 },
    { re: /asleep duration/i, field: 'sleepH', min: true },
    { re: /rem duration/i, field: 'remH', min: true },
    { re: /deep \(sws\) duration|sws duration/i, field: 'deepH', min: true },
    { re: /light sleep duration/i, field: 'lightH', min: true },
    { re: /awake duration/i, field: 'awakeH', min: true },
    { re: /sleep need/i, field: 'sleepNeedH', min: true },
    { re: /sleep performance/i, field: 'sleepPerf' },
    { re: /sleep consistency/i, field: 'sleepConsistency' },
    { re: /sleep efficiency/i, field: 'sleepEfficiency', dp: 1 },
    { re: /respiratory rate/i, field: 'respRate', dp: 1 },
    { re: /day strain|^strain$/i, field: 'strain', dp: 1 },
    { re: /energy burned/i, field: 'calories' },
    { re: /average hr/i, field: 'avgHR' },
    { re: /max hr/i, field: 'maxHR' },
  ];

  function importCSV(text) {
    const rows = parseCSV(text);
    if (rows.length < 2) return { imported: 0 };
    const header = rows[0];
    const dateIdx = header.findIndex((h) => /cycle start|^date$|^day$/i.test(h));
    if (dateIdx === -1) return { error: 'Could not find a date column — is this the Whoop physiological_cycles.csv export?' };
    const colIdx = COLS.map((c) => ({ ...c, i: header.findIndex((h) => c.re.test(h)) })).filter((c) => c.i !== -1);

    const data = getWhoopData();
    let imported = 0;
    for (const row of rows.slice(1)) {
      const rawDate = row[dateIdx];
      if (!rawDate) continue;
      const d = new Date(rawDate.replace(' ', 'T'));
      if (isNaN(d)) continue;
      const key = dateKey(d);
      const rec = {};
      for (const c of colIdx) {
        const v = row[c.i];
        if (v === '' || v === undefined || isNaN(+v)) continue;
        const num = c.min ? +v / 60 : +v;
        rec[c.field] = +num.toFixed(c.dp !== undefined ? c.dp : c.min ? 2 : 0);
      }
      if (Object.keys(rec).length === 0) continue;
      data[key] = { ...(data[key] || {}), ...rec };
      imported++;
    }
    setWhoopData(data);
    return { imported };
  }
  window._importWhoopCSV = importCSV; // exposed for testing

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

  /* Latest entry that has this field (metrics can lag by a day). */
  function latestWith(entries, field) {
    for (let i = entries.length - 1; i >= 0; i--) {
      if (entries[i][field] !== undefined) return entries[i];
    }
    return null;
  }

  /* ---------- stat tiles ---------- */
  function recoveryStatus(r) {
    if (r >= 67) return { icon: 'check', word: 'Green — well recovered' };
    if (r >= 34) return { icon: 'alert', word: 'Yellow — moderate' };
    return { icon: 'alert', word: 'Red — run down' };
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
      tiles.push({ label: 'Recovery', value: `${latest.recovery}<small>%</small>`, delta: `${SM.icon(st.icon)} ${st.word}`, accent: 'recovery' });
    }
    for (const [field, dir] of [['hrv', 'up'], ['rhr', 'down']]) {
      if (latest[field] === undefined) continue;
      const base = baseline(entries, field, 14, latest.key);
      let delta = '', cls = '';
      if (base) {
        const pct = ((latest[field] - base) / base) * 100;
        cls = (dir === 'up' ? pct >= 0 : pct <= 0) ? 'up' : 'down';
        delta = `${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct).toFixed(1)}% vs 14-day avg`;
      }
      const m = ALL_METRICS.find((x) => x.key === field);
      tiles.push({ label: m.label, value: `${latest[field]}<small> ${m.unit}</small>`, delta, cls, accent: 'recovery' });
    }
    if (latest.sleepH !== undefined) {
      const h = Math.floor(latest.sleepH);
      const m = Math.round((latest.sleepH - h) * 60);
      tiles.push({ label: 'Sleep', value: `${h}<small>h</small> ${m}<small>m</small>`, delta: latest.sleepPerf !== undefined ? `${latest.sleepPerf}% sleep performance` : '', accent: 'sleep' });
    }
    if (latest.strain !== undefined) {
      tiles.push({ label: 'Day strain', value: `${latest.strain}`, delta: 'scale 0–21', accent: 'strain' });
    }

    for (const t of tiles) {
      const div = document.createElement('div');
      div.className = `card tile accent-${t.accent || 'vitals'}`;
      div.innerHTML = `<div class="label">${t.label}</div><div class="value">${t.value}</div><div class="delta ${t.cls || ''}">${t.delta || ''}</div>`;
      wrap.appendChild(div);
    }
  }

  /* ---------- weekly digest: the last 7 days in plain English ---------- */
  function avgOf(entries, field, from, to) {
    const vals = entries.filter((e) => e.key >= from && e.key < to && e[field] !== undefined).map((e) => e[field]);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  }

  function renderDigest(entries) {
    const wrap = document.getElementById('digest');
    if (!wrap) return;
    const today = dateKey(new Date());
    const wk = dateKey(addDays(new Date(), -7));
    const prev = dateKey(addDays(new Date(), -14));
    const sentences = [];

    const fmtH = (h) => `${Math.floor(h)}h ${String(Math.round((h - Math.floor(h)) * 60)).padStart(2, '0')}m`;
    const trend = (now, before, upIsGood, unit = '') => {
      if (before === null) return '';
      const d = now - before;
      if (Math.abs(d) < (unit === '%' ? 2 : 0.15)) return ' — steady on the week before';
      const dir = d > 0 ? 'up' : 'down';
      const good = (d > 0) === upIsGood ? 'better than' : 'down on';
      return unit === 'h' ? ` — ${dir} ${fmtH(Math.abs(d))} on the week before` : ` — ${dir} ${Math.abs(d).toFixed(0)}${unit}, ${good} the week before`;
    };

    const rec = avgOf(entries, 'recovery', wk, today), recPrev = avgOf(entries, 'recovery', prev, wk);
    if (rec !== null) sentences.push(`Recovery averaged <b style="color:var(--m-recovery)">${Math.round(rec)}%</b>${trend(rec, recPrev, true, '%')}.`);

    const slp = avgOf(entries, 'sleepH', wk, today), slpPrev = avgOf(entries, 'sleepH', prev, wk);
    const need = avgOf(entries, 'sleepNeedH', wk, today);
    if (slp !== null) {
      let s = `You slept <b style="color:var(--m-sleep)">${fmtH(slp)}</b> a night on average`;
      if (need !== null) s += slp >= need - 0.25 ? `, meeting your ~${fmtH(need)} need` : `, about ${fmtH(need - slp)} short of your ~${fmtH(need)} need`;
      sentences.push(s + `${trend(slp, slpPrev, true, 'h')}.`);
    }

    const str = avgOf(entries, 'strain', wk, today), strPrev = avgOf(entries, 'strain', prev, wk);
    const burn = avgOf(entries, 'calories', wk, today);
    if (str !== null) {
      let s = `Daily strain averaged <b style="color:var(--m-strain)">${str.toFixed(1)}</b>`;
      if (burn !== null) s += ` (~${Math.round(burn)} kcal burned/day)`;
      sentences.push(s + `${trend(str, strPrev, true, '')}.`);
    }

    const week = entries.filter((e) => e.key >= wk && e.key < today && e.recovery !== undefined);
    if (week.length >= 3) {
      const best = week.reduce((a, b) => (b.recovery > a.recovery ? b : a));
      const worst = week.reduce((a, b) => (b.recovery < a.recovery ? b : a));
      const dayName = (k) => parseKey(k).toLocaleDateString(undefined, { weekday: 'long' });
      sentences.push(`Best day ${dayName(best.key)} (${best.recovery}%), toughest ${dayName(worst.key)} (${worst.recovery}%).`);
    }

    if (!sentences.length) {
      wrap.innerHTML = SM.empty('activity', 'No digest yet', 'Once a week of data has synced, a plain-English summary of your trends appears here.');
      return;
    }
    wrap.innerHTML = `<div class="card"><h2 style="margin-top:0">${SM.icon('info')} Last 7 days</h2><p style="margin:0;color:var(--ink-2);max-width:78ch">${sentences.join(' ')}</p></div>`;
  }

  /* ---------- shift-aware daily recommendations (unchanged rules) ---------- */
  function recommendations(entries) {
    const recs = [];
    const now = new Date();
    const today = shiftFor(now);
    const tomorrow = shiftFor(addDays(now, 1));
    const latest = entries.length ? entries[entries.length - 1] : null;

    if (today.code === 'N') {
      if (today.run === 1) {
        recs.push(['info', 'moon', 'First night shift tonight', 'Sleep in as late as you can this morning and take a 90–120 minute nap between 14:00 and 17:00. Save caffeine for the start of the shift and cut it off 6+ hours before your morning bedtime.']);
      } else if (today.run === today.runLength) {
        recs.push(['info', 'moon', `Last night shift tonight (${today.run} of ${today.runLength})`, 'Tomorrow morning, sleep a short 90 min–3 h block instead of a full day sleep, get bright daylight in the afternoon, then an early normal night — that flips you back to days fastest.']);
      } else {
        recs.push(['info', 'moon', `Night ${today.run} of ${today.runLength}`, 'Protect your day sleep: blackout, phone on do-not-disturb, one continuous block starting within an hour of getting home. Eat your main meal before the shift, keep food between midnight and 06:00 light.']);
      }
    } else if (today.code === 'D') {
      recs.push(['info', 'sun', `Day shift ${today.run} of ${today.runLength} (07:00–19:00)`, 'Aim for lights out by 22:00 to bank 8 h before the alarm. Caffeine before noon only. Get daylight on your commute to keep your body clock anchored.']);
    } else {
      const yesterday = shiftFor(addDays(now, -1));
      if (yesterday.code === 'N') {
        recs.push(['info', 'bed', 'First rest day after nights', 'Short morning sleep, not a full day — then push through to a normal early bedtime tonight. Daylight and a walk this afternoon speed the reset.']);
      }
      if (tomorrow.code !== 'O') {
        const t = tomorrow.code === 'N' ? 'nights' : 'days';
        recs.push(['info', 'calendar', `Back on ${t} tomorrow`, tomorrow.code === 'N' ? 'Stay up late tonight and lie in tomorrow to pre-shift your clock for the first night.' : 'Early night tonight — you are up before 06:00 tomorrow.']);
      } else {
        recs.push(['good', 'check', `Rest day ${today.run} of ${today.runLength}`, 'Keep sleep and meals near normal daytime hours so your baseline recovers before the next block.']);
      }
    }

    if (!latest) {
      recs.push(['warning', 'download', 'No Whoop data yet', 'Connect the Whoop sync or import your CSV export to unlock recovery-based recommendations.']);
      return recs;
    }

    if (latest.recovery !== undefined) {
      const onShift = today.code !== 'O';
      if (latest.recovery >= 67) {
        recs.push(['good', 'flame', `Recovery ${latest.recovery}% — green`, onShift ? 'You can handle a proper session today, but schedule it before a day shift or before sleep prep on nights — not right after a 12-hour shift.' : 'Great day for your hardest training of the week.']);
      } else if (latest.recovery >= 34) {
        recs.push(['warning', 'alert', `Recovery ${latest.recovery}% — moderate`, 'Keep training to zone 2 cardio or light weights. Prioritise sleep quantity tonight over an extra session.']);
      } else {
        recs.push(['critical', 'alert', `Recovery ${latest.recovery}% — red`, onShift ? 'Skip training. On shift: hydrate, eat properly, and get to bed the moment you are home. Red recoveries stack fast on this rota.' : 'Full rest day: no training, extra sleep, easy food. Let the body catch up before the next block.']);
      }
    }

    const hrvBase = baseline(entries, 'hrv', 14, latest.key);
    if (latest.hrv !== undefined && hrvBase) {
      const pct = ((latest.hrv - hrvBase) / hrvBase) * 100;
      if (pct <= -10) recs.push(['serious', 'activity', `HRV ${Math.abs(pct).toFixed(0)}% below your 14-day average`, 'Your nervous system is under load — common mid-nights. Drop training intensity, front-load protein and fluids, and guard your next sleep window.']);
    }

    const rhrBase = baseline(entries, 'rhr', 14, latest.key);
    if (latest.rhr !== undefined && rhrBase) {
      const pct = ((latest.rhr - rhrBase) / rhrBase) * 100;
      if (pct >= 5) recs.push(['serious', 'heart', `Resting HR ${pct.toFixed(0)}% above your 14-day average`, 'Elevated RHR can signal poor sleep, dehydration or oncoming illness. Ease off caffeine and alcohol, hydrate, and watch tomorrow\'s reading.']);
    }

    const recent = series(entries, 'sleepH', 4);
    if (recent.length >= 3) {
      const avg = recent.reduce((a, b) => a + b.value, 0) / recent.length;
      if (avg < 6.5) {
        recs.push(['serious', 'bed', `Averaging ${avg.toFixed(1)} h sleep over the last ${recent.length} days`, today.code === 'N' ? 'You are building sleep debt mid-nights. Add a 30–90 min nap before tonight\'s shift and treat day sleep as non-negotiable.' : 'Bank extra sleep tonight and consider an afternoon nap — pay the debt down before the next shift block.']);
      }
    }

    if (entries.length >= 2) {
      const prev = entries[entries.length - 2];
      if (prev.strain !== undefined && latest.recovery !== undefined && prev.strain >= 14 && latest.recovery < 50) {
        recs.push(['warning', 'alert', 'High strain is outpacing recovery', `Yesterday's strain was ${prev.strain} but recovery came back at ${latest.recovery}%. On a 4-on-4-off rota, save the big efforts for your off days.`]);
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
      div.innerHTML = `<div class="icon">${SM.icon(icon)}</div><div><h4>${title}</h4><p>${body}</p></div>`;
      wrap.appendChild(div);
    }
  }

  /* ---------- per-metric improvement guide ----------
   * Each entry: (value, ctx) → { cls: good|warning|serious|info, note, advice }.
   * ctx = { base (14-day avg excl. latest), latest (full record), entries } */
  const GUIDE = {
    recovery: (v) =>
      v >= 67 ? ['good', 'Green zone', 'Keep doing what you did yesterday: enough sleep, moderate load. Bank hard training on green days — especially your off-days.']
      : v >= 34 ? ['warning', 'Yellow zone', 'Raise it by protecting tonight\'s sleep window (aim for your full sleep need), easing training to zone 2, hydrating, and skipping alcohol. Recovery mostly reflects yesterday\'s choices.']
      : ['serious', 'Red zone', 'Rest today. The fastest levers: a full sleep (or day-sleep) block, no alcohol, no hard training, light food, fluids. Repeated reds on nights mean your day sleep needs fixing first.'],
    hrv: (v, { base }) => {
      if (!base) return ['info', 'Building your baseline', 'HRV is personal — compare only to your own average. It rises with consistent sleep times, zone-2 cardio, good hydration, and no evening alcohol.'];
      const pct = ((v - base) / base) * 100;
      return pct >= -5
        ? ['good', `${pct >= 0 ? '+' : ''}${pct.toFixed(0)}% vs your average`, 'On or above baseline — your nervous system is coping. Keep bedtimes consistent (hard on shifts, so anchor the same sleep routine even when the clock shifts).']
        : ['warning', `${pct.toFixed(0)}% vs your average`, 'Below baseline: cut training intensity today, hydrate, avoid alcohol and late caffeine, and add 30–60 min extra sleep. Persistent dips across a night block = build in a pre-shift nap.'];
    },
    rhr: (v, { base }) => {
      if (!base) return ['info', 'Building your baseline', 'Lower over months = improving aerobic fitness. Day-to-day spikes flag poor sleep, dehydration, alcohol or oncoming illness.'];
      const pct = ((v - base) / base) * 100;
      return pct <= 3
        ? ['good', `${pct >= 0 ? '+' : ''}${pct.toFixed(0)}% vs your average`, 'Steady. Long-term, regular zone-2 cardio (brisk walks, easy runs, bike) is what pushes resting HR down.']
        : ['warning', `+${pct.toFixed(0)}% vs your average`, 'Elevated: rehydrate, skip alcohol, avoid a heavy late meal before sleep, and watch for illness. Expect some elevation mid-night-block — it should settle on your off days.'];
    },
    spo2: (v) =>
      v >= 95 ? ['good', 'Normal range', 'Nothing to do — 95%+ during sleep is healthy.']
      : v >= 92 ? ['warning', 'Slightly low', 'Try side-sleeping, treat nasal congestion, and keep the bedroom ventilated. Re-check over several nights — single dips are usually noise or a loose strap.']
      : ['serious', 'Low reading', 'Consistently under 92% is worth mentioning to your GP (snoring/apnoea screen), especially with loud snoring or daytime exhaustion beyond shift fatigue. Check strap fit first.'],
    skinTemp: (v, { base }) => {
      if (!base) return ['info', 'Building your baseline', 'Whoop tracks deviation from your own norm. Spikes usually mean oncoming illness, a hot room, alcohol, or late training.'];
      const dev = v - base;
      return Math.abs(dev) <= 0.8
        ? ['good', `${dev >= 0 ? '+' : ''}${dev.toFixed(1)} °C vs your average`, 'Within your normal band. A cool bedroom (~18 °C) also deepens sleep — useful for day-sleeping in summer.']
        : ['warning', `${dev >= 0 ? '+' : ''}${dev.toFixed(1)} °C vs your average`, 'Off your baseline — possible early illness or an overheated sleep environment. Cool the room, hydrate, and go easy today; watch tomorrow\'s recovery.'];
    },
    sleepH: (v, { latest }) => {
      const need = latest.sleepNeedH;
      const target = need || 8;
      return v >= Math.min(target, 7.5) ? ['good', need ? `vs ${need.toFixed(1)} h needed` : '7 h+', 'You hit your need. On nights, keep the same total by protecting one long day-sleep block plus a pre-shift nap.']
        : v >= 6 ? ['warning', need ? `${(target - v).toFixed(1)} h short of need` : 'Under 7 h', 'Add a 30–90 min nap (14:00–17:00 before nights; after lunch on rest days) and pull bedtime earlier. Blackout + phone on DND buys 30–60 min of day sleep.']
        : ['serious', need ? `${(target - v).toFixed(1)} h short of need` : 'Under 6 h', 'This is where errors and cravings spike on shift. Treat the next sleep as an appointment: blackout, earplugs/white noise, no screens in bed, nap before the shift.'];
    },
    sleepNeedH: (v) => ['info', 'Whoop\'s target for you', 'This rises with strain and accumulated debt. Use it as tonight\'s target rather than a fixed 8 h — on heavy shift days it will ask for more.'],
    sleepPerf: (v) =>
      v >= 85 ? ['good', '85%+', 'You\'re giving your body most of the sleep it asks for. Hold the routine through the shift flip.']
      : v >= 70 ? ['warning', '70–85%', 'The gap is time-in-bed: schedule a longer window rather than trying to sleep "better". Start your day-sleep within an hour of getting home from nights.']
      : ['serious', 'Under 70%', 'Big shortfall vs need. Rebuild the window first (longer block + nap), then quality: blackout, cool room, caffeine cut-off 6 h before bed.'],
    sleepConsistency: (v) =>
      v >= 70 ? ['good', '70%+', 'Strong for a shift worker. Keep meal times and your pre-sleep routine identical even when bedtime moves — the routine is the anchor.']
      : v >= 50 ? ['warning', '50–70%', 'Expected on rotating shifts — don\'t chase a perfect score. Improve it where you can: identical sleep/wake times within each 4-day block, and a fixed wind-down ritual regardless of clock time.']
      : ['serious', 'Under 50%', 'Very irregular timing amplifies fatigue. Within each block keep the same sleep window daily, and on off days settle to one schedule by day two rather than oscillating.'],
    sleepEfficiency: (v) =>
      v >= 90 ? ['good', '90%+', 'You fall asleep and stay asleep — no action needed.']
      : v >= 85 ? ['warning', '85–90%', 'Slightly broken sleep: cut screens in bed, keep the room cooler, and avoid big fluids in the last hour so you\'re not woken by the bathroom mid-day-sleep.']
      : ['serious', 'Under 85%', 'Lots of time awake in bed. Only go to bed sleepy, use the bed for sleep only, and if awake 20+ min get up briefly in dim light. For day sleep: blackout + earplugs + phone on DND are non-negotiable.'],
    remH: (v) =>
      v >= 1.5 ? ['good', 'Solid REM', 'REM (mental recovery) is fed by total sleep time and regular timing — you\'re getting there. Alcohol is the #1 REM killer; keep it away from sleep.']
      : ['warning', 'On the low side', 'REM concentrates late in sleep, so short sleeps starve it. Extend the block (even 45 min), skip alcohol, and keep wake time consistent. Morning-after-nights REM is naturally lower — judge across the week.'],
    deepH: (v) =>
      v >= 1.2 ? ['good', 'Solid deep sleep', 'Deep sleep (physical recovery) responds to training load and a cool, dark room — keep both.']
      : ['warning', 'On the low side', 'Boost it with daytime exercise (not within 2 h of sleep), a cooler bedroom, no caffeine within 8 h of bed, and no alcohol. Deep sleep comes early in the block, so protect the first hours fiercely.'],
    lightH: () => ['info', 'Context metric', 'Light sleep is the flexible filler between REM and deep — there\'s no target. If it dominates while deep/REM are low, work on the levers for those two.'],
    awakeH: (v) =>
      v <= 0.75 ? ['good', 'Minimal wake time', 'Normal amount of waking — nothing to fix.']
      : v <= 1.25 ? ['warning', 'Broken sleep', 'Hunt the disturber: light leaks (blackout), noise (earplugs/white noise), heat, late fluids, or the phone. For day sleep, tell the household your window and silence the doorbell.']
      : ['serious', 'Very broken sleep', 'An hour-plus awake fragments every stage. Fix the environment first (dark, quiet, cool, phone out of reach); if you\'re awake long stretches anyway, get up briefly and restart rather than lying frustrated.'],
    disturbances: (v) =>
      v <= 12 ? ['good', 'Typical range', 'Everyone wakes briefly many times a night — this count is normal.']
      : ['warning', 'Elevated', 'More broken than usual: check noise, light, temperature, evening alcohol, and late meals. On day sleeps, white noise masks the daytime world surprisingly well.'],
    respRate: (v, { base }) => {
      if (!base) return ['info', 'Building your baseline', 'Very stable per person night-to-night. A rise of 1+ breaths/min above your norm is an early illness flag.'];
      const dev = v - base;
      return Math.abs(dev) <= 1
        ? ['good', `${dev >= 0 ? '+' : ''}${dev.toFixed(1)} rpm vs your average`, 'Stable — a good sign even when other scores wobble.']
        : ['warning', `${dev >= 0 ? '+' : ''}${dev.toFixed(1)} rpm vs your average`, 'Off baseline — often precedes illness by a day or two. Ease training, sleep more, and don\'t be surprised by a rough recovery tomorrow.'];
    },
    strain: (v, { latest }) => {
      const r = latest.recovery;
      if (r === undefined) return ['info', 'Balance it against recovery', 'Aim roughly: red recovery → strain under 10, yellow → 10–14, green → 14+. Remember a 12-hour shift already generates strain before any training.'];
      const target = r >= 67 ? [14, 18] : r >= 34 ? [10, 14] : [0, 10];
      if (v < target[0]) return ['info', `Room to push (recovery ${r}%)`, 'You\'re under-reaching your recovery — a quality session today converts green recoveries into fitness.'];
      if (v <= target[1]) return ['good', `Matched to recovery ${r}%`, 'Strain and recovery are balanced — the sustainable zone for a 4-on-4-off pattern.'];
      return ['warning', `High vs recovery ${r}%`, 'You outspent your recovery. Expect a dip tomorrow; make the next sleep count and keep tomorrow easy.'];
    },
    calories: (v) => ['info', 'Fuel target', `You burned ~${Math.round(v)} kcal. Set your meal-prep calorie target near this (slightly under to lose, over to gain) — the Meal prep page tracks you against it.`],
    avgHR: () => ['info', 'Context metric', 'Tracks overall daily load — it rises on shift days with lots of time on your feet. No target; watch the trend alongside strain.'],
    maxHR: () => ['info', 'Context metric', 'Highest heart rate reached — usually from training or running for the bus. Useful for checking training zones, not something to optimise.'],
  };

  const GUIDE_ICON = { good: 'check', warning: 'alert', serious: 'alert', info: 'info' };

  function renderGuide(entries) {
    const wrap = document.getElementById('guide');
    const group = GROUPS.find((g) => g.key === activeTab());
    wrap.innerHTML = '';
    if (!entries.length) return; // empty state lives in the charts pane
    const withData = group.metrics.filter((m) => latestWith(entries, m.key));
    for (const m of withData) {
      const latest = latestWith(entries, m.key);
      const v = latest[m.key];
      const base = baseline(entries, m.key, 14, latest.key);
      const [cls, note, advice] = GUIDE[m.key](v, { base, latest, entries });
      const shown = +(+v).toFixed(2);
      const div = document.createElement('div');
      div.className = `rec ${cls}`;
      div.innerHTML =
        `<div class="icon">${SM.icon(GUIDE_ICON[cls])}</div><div><h4>${m.label}: ${shown}${m.unit ? ' ' + m.unit : ''} <span style="color:var(--muted);font-weight:500">· ${note}</span></h4>` +
        `<p>${advice}</p></div>`;
      wrap.appendChild(div);
    }
  }

  /* ---------- category tabs + charts ---------- */
  const activeTab = () => Store.get('whoopTab', 'recovery');

  function renderTabs() {
    const bar = document.getElementById('cat-tabs');
    bar.innerHTML = '';
    for (const g of GROUPS) {
      const btn = document.createElement('button');
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', g.key === activeTab() ? 'true' : 'false');
      btn.style.setProperty('--tab-accent', g.color);
      btn.innerHTML = `${SM.icon(g.icon)}${g.title}`;
      btn.addEventListener('click', () => {
        Store.set('whoopTab', g.key);
        renderTabs();
        const entries = sortedEntries();
        renderCharts(entries);
        renderGuide(entries);
      });
      bar.appendChild(btn);
    }
  }

  function renderCharts(entries) {
    const days = +document.getElementById('range').value;
    const wrap = document.getElementById('charts');
    const group = GROUPS.find((g) => g.key === activeTab());
    wrap.innerHTML = '';

    if (!entries.length) {
      wrap.innerHTML = SM.empty('activity', 'No Whoop data yet',
        'Connect your Whoop above (or import the CSV export) and your trends will appear here. The first sync takes under a minute.');
      return;
    }

    const grid = document.createElement('div');
    grid.className = 'grid cols-2';
    const missing = [];
    for (const m of group.metrics) {
      const data = series(entries, m.key, days);
      if (!data.length) { missing.push(m.label); continue; }
      const div = document.createElement('div');
      grid.appendChild(div);
      renderLineChart(div, { title: m.label, unit: m.unit, color: group.color, data, yMin: m.min, yMax: m.max });
    }
    if (!grid.children.length) {
      wrap.innerHTML = SM.empty(group.icon, `No ${group.title.toLowerCase()} data in this range`,
        group.key === 'vitals'
          ? 'SpO₂ and skin temperature need a Whoop 4.0+ worn overnight — they usually appear after the first full night of synced sleep.'
          : 'This will fill in as Whoop scores more days. New members can take a few days to calibrate.');
      return;
    }
    wrap.appendChild(grid);
    if (missing.length) {
      const note = document.createElement('p');
      note.className = 'notice';
      note.style.marginTop = '8px';
      note.textContent = `No data yet for: ${missing.join(', ')}.`;
      wrap.appendChild(note);
    }
  }

  function refresh() {
    const entries = sortedEntries();
    renderTiles(entries);
    renderRecs(entries);
    renderDigest(entries);
    renderTabs();
    renderGuide(entries);
    renderCharts(entries);
    document.getElementById('entry-count').textContent = entries.length
      ? `${entries.length} days of data stored in this browser.`
      : 'No data stored yet.';
  }

  /* ---------- one-click resync (triggers the GitHub workflow) ---------- */
  const GH_API = Store.get('ghapi', 'https://api.github.com'); // overridable for testing
  const getSyncCfg = () => Store.get('ghsync', { token: '', repo: 'Reece-Porter/WhoopMaxxing', branch: '' });

  function syncStatus(text) {
    document.getElementById('sync-status').textContent = text;
  }

  /* The workflow file must exist on the ref we dispatch against, so try the
   * configured branch, then the usual suspects. */
  async function dispatchSync(cfg) {
    const branches = [...new Set([cfg.branch, 'main', 'master', 'claude/shift-work-efficiency-site-wijsqv'].filter(Boolean))];
    let lastErr = '';
    for (const ref of branches) {
      const res = await fetch(`${GH_API}/repos/${cfg.repo}/actions/workflows/whoop-sync.yml/dispatches`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${cfg.token}`,
          accept: 'application/vnd.github+json',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ ref }),
      });
      if (res.status === 204) return ref;
      lastErr = `HTTP ${res.status}`;
      if (res.status === 401 || res.status === 403) {
        throw new Error(`${lastErr} — the token was rejected. Re-check it has "Actions: Read and write" on this repo (Set up one-click sync).`);
      }
    }
    throw new Error(`${lastErr} — couldn't find the workflow on any branch. Set the branch explicitly in "Set up one-click sync".`);
  }

  async function runSyncNow() {
    const cfg = getSyncCfg();
    if (!cfg.token) {
      // No token configured: open the workflow page where Run workflow is one click
      window.open(`https://github.com/${cfg.repo}/actions/workflows/whoop-sync.yml`, '_blank', 'noopener');
      syncStatus('Opened the Whoop sync workflow on GitHub — click "Run workflow" there, or use "Set up one-click sync" to trigger it from this button directly.');
      return;
    }
    const btn = document.getElementById('sync-now');
    btn.disabled = true;
    try {
      const prev = Store.get('lastSync', null);
      const ref = await dispatchSync(cfg);
      syncStatus(`Sync started on GitHub (${ref}) — waiting for fresh data…`);
      for (let i = 0; i < 16; i++) {
        await new Promise((r) => setTimeout(r, 15000));
        const updated = await loadRepoWhoopData();
        if (updated && updated !== prev) {
          Store.set('lastSync', updated);
          refresh();
          syncStatus(`Auto-synced from the Whoop API — last sync ${new Date(updated).toLocaleString()}.`);
          return;
        }
      }
      syncStatus('Sync ran on GitHub — new data hasn\'t reached this page yet (hosting can lag a minute or two). Refresh shortly.');
    } catch (e) {
      syncStatus('Sync trigger failed: ' + e.message);
    } finally {
      btn.disabled = false;
    }
  }

  /* ---------- wiring ---------- */
  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('sync-now').addEventListener('click', runSyncNow);

    const syncDialog = document.getElementById('sync-dialog');
    document.getElementById('sync-setup').addEventListener('click', () => {
      const cfg = getSyncCfg();
      document.getElementById('sync-token').value = cfg.token;
      document.getElementById('sync-repo').value = cfg.repo;
      document.getElementById('sync-branch').value = cfg.branch;
      syncDialog.showModal();
    });
    document.getElementById('sync-cancel').addEventListener('click', () => syncDialog.close());
    document.getElementById('sync-form').addEventListener('submit', (ev) => {
      ev.preventDefault();
      Store.set('ghsync', {
        token: document.getElementById('sync-token').value.trim(),
        repo: document.getElementById('sync-repo').value.trim() || 'Reece-Porter/WhoopMaxxing',
        branch: document.getElementById('sync-branch').value.trim(),
      });
      syncDialog.close();
      syncStatus('One-click sync configured — the Sync now button will trigger the workflow directly.');
    });

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
      Store.set('lastSync', updated);
      syncStatus(`Auto-synced from the Whoop API — last sync ${new Date(updated).toLocaleString()}.`);
      refresh();
    });
  });
})();
