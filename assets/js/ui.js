/* Shared UI shell: one icon set (inline SVG, Lucide-style strokes), the
 * header/nav with logo + today's-shift chip, and the cross-module Today strip
 * shown on every page. Requires shifts.js and store.js loaded first. */
const SM = (() => {
  const P = (d) => `<path d="${d}"/>`;
  const PATHS = {
    home: P('M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z'),
    calendar: P('M8 2v4M16 2v4M3 9h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z'),
    activity: P('M22 12h-4l-3 8L9 4l-3 8H2'),
    utensils: P('M4 3v7a2 2 0 0 0 2 2h0a2 2 0 0 0 2-2V3M6 3v18M15 3v18M15 8c0-2.8 1.8-5 4-5v13'),
    pot: P('M4 10h16M6 10v7a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3v-7M2 10l2-3h16l2 3M10 4l1-2M14 4l-1-2'),
    settings: P('M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2L10 21h4l.5-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z'),
    zap: P('M13 2 4 14h6l-1 8 9-12h-6l1-8z'),
    refresh: P('M21 12a9 9 0 1 1-2.6-6.4M21 3v6h-6'),
    camera: P('M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z'),
    search: P('M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3'),
    printer: P('M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z'),
    alert: P('M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01'),
    info: P('M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01'),
    check: P('M22 11.1V12a10 10 0 1 1-5.9-9.1M22 4 12 14l-3-3'),
    x: P('M18 6 6 18M6 6l12 12'),
    moon: P('M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z'),
    sun: P('M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4'),
    bed: P('M2 4v16M2 8h18a2 2 0 0 1 2 2v10M2 17h20M6 8v9'),
    flame: P('M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3 2.5.5 5 2.5 5 6a4.5 4.5 0 0 1-9 0c0-1.2.3-2.3 1-3.2.3.9.8 1.7 1.5 2.7zM12 2s3 3 3 7c2-1 3-2.5 3-2.5.7 1.8 1 3.6 1 5.5a7 7 0 1 1-14 0c0-5 5-8 7-10z'),
    heart: P('M19 14c1.5-1.5 3-3.3 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3.4.9-4.5 2.3A5.7 5.7 0 0 0 7.5 3 5.5 5.5 0 0 0 2 8.5c0 2.2 1.5 4 3 5.5l7 7z'),
    droplet: P('M12 2.7S6 9 6 13.5a6 6 0 0 0 12 0C18 9 12 2.7 12 2.7z'),
    download: P('M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3'),
    barcode: P('M3 5v14M8 5v14M12 5v14M17 5v14M21 5v14'),
    plus: P('M12 5v14M5 12h14'),
    clock: P('M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2'),
  };
  function icon(name, cls = '') {
    return `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name] || PATHS.info}</svg>`;
  }

  const NAV = [
    ['index.html', 'home', 'home', 'Dashboard'],
    ['rota.html', 'rota', 'calendar', 'Rota'],
    ['schedule.html', 'schedule', 'clock', 'Schedule'],
    ['whoop.html', 'whoop', 'activity', 'Whoop'],
    ['meals.html', 'meals', 'utensils', 'Meal prep'],
    ['batches.html', 'batches', 'pot', 'Batch cook'],
    ['settings.html', 'settings', 'settings', 'Settings'],
  ];

  function shiftChipHTML() {
    const s = shiftFor(new Date());
    const color = s.code === 'N' ? 'var(--shift-night)' : s.code === 'D' ? 'var(--shift-day)' : 'var(--muted)';
    const label = s.code === 'O' ? `Off ${s.run}/${s.runLength}` : `${s.code === 'N' ? 'Night' : 'Day'} ${s.run}/${s.runLength} · ${s.times.start}`;
    return `<span class="tchip" title="Today's shift"><span style="width:8px;height:8px;border-radius:50%;background:${color}"></span><b>${label}</b></span>`;
  }

  function renderHeader() {
    const host = document.getElementById('app-header');
    if (!host) return;
    const page = document.body.dataset.page;
    host.innerHTML =
      `<div class="header-inner">` +
      `<a class="brand" href="index.html">` +
      `<span class="mark">${icon('zap')}</span><span>Shift<em>Maxx</em></span></a>` +
      `<nav class="nav" aria-label="Main">` +
      NAV.map(([href, key, ic, label]) => `<a href="${href}" ${key === page ? 'class="active" aria-current="page"' : ''}>${icon(ic)}${label}</a>`).join('') +
      `</nav>` +
      `<span class="header-shift">${shiftChipHTML()}</span>` +
      `</div>`;
  }

  /* The cross-module Today strip: shift · recovery · sleep · planned kcal · next block */
  function fmtH(h) {
    const H = Math.floor(h), M = Math.round((h - H) * 60);
    return `${H}h ${String(M).padStart(2, '0')}m`;
  }

  function todayStripHTML() {
    const now = new Date();
    const chips = [];

    // recovery + sleep from the latest whoop day that has them
    const data = getWhoopData();
    const keys = Object.keys(data).sort();
    let rec = null, sleep = null;
    for (let i = keys.length - 1; i >= 0 && (rec === null || sleep === null); i--) {
      if (rec === null && data[keys[i]].recovery !== undefined) rec = data[keys[i]].recovery;
      if (sleep === null && data[keys[i]].sleepH !== undefined) sleep = data[keys[i]].sleepH;
    }
    if (rec !== null) {
      const col = rec >= 67 ? 'var(--s-good)' : rec >= 34 ? 'var(--s-warning)' : 'var(--s-critical)';
      chips.push(`<a class="tchip" href="whoop.html" style="color:var(--ink-2)"><span style="width:8px;height:8px;border-radius:50%;background:${col}"></span>Recovery <b>${rec}%</b></a>`);
    } else {
      chips.push(`<a class="tchip" href="whoop.html">${icon('activity')}<b>Connect Whoop</b></a>`);
    }
    if (sleep !== null) chips.push(`<a class="tchip" href="whoop.html">${icon('bed')}Sleep <b>${fmtH(sleep)}</b></a>`);

    // planned kcal today vs target
    const plans = getMealPlans();
    const plan = plans[dateKey(now)];
    if (plan) {
      let kcal = 0;
      for (const s in plan.sections) for (const it of plan.sections[s]) kcal += Math.round(it.per100.kcal * (it.unit === 'portion' ? it.grams : it.grams / 100));
      chips.push(`<a class="tchip" href="meals.html">${icon('utensils')}Planned <b>${kcal}</b> / ${getTargets().kcal} kcal</a>`);
    } else {
      chips.push(`<a class="tchip" href="meals.html">${icon('utensils')}<b>Plan today's meals</b></a>`);
    }

    // next working block
    const today = shiftFor(now);
    const next = upcomingShifts(addDays(now, 1), 20).find((u) => u.code !== 'O' && u.run === 1);
    if (today.code === 'O' && next) {
      const days = Math.round((localMidnight(next.date) - localMidnight(now)) / 86400000);
      chips.push(`<a class="tchip" href="rota.html">${icon('clock')}${next.code === 'N' ? 'Nights' : 'Days'} start <b>${days === 1 ? 'tomorrow' : `in ${days} days`}</b></a>`);
    }

    return chips.join('');
  }

  function renderTodayStrip() {
    const host = document.getElementById('today-strip');
    if (!host) return;
    host.innerHTML = `<div class="strip-inner">${todayStripHTML()}</div>`;
  }

  function empty(iconName, title, body) {
    return `<div class="empty">${icon(iconName)}<b>${title}</b>${body}</div>`;
  }

  function banner(kind, iconName, title, body) {
    return `<div class="banner ${kind}">${icon(iconName, 'lg')}<div class="b-body"><b>${title}</b><p>${body}</p></div></div>`;
  }

  document.addEventListener('DOMContentLoaded', () => {
    renderHeader();
    renderTodayStrip();
  });

  return { icon, empty, banner, renderTodayStrip };
})();
