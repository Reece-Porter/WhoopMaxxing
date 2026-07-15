/* Shift rota engine.
 * Pattern: 4 nights -> 4 off -> 4 days -> 4 off, repeating every 16 days.
 * The cycle is anchored so that the first night shift is 19 July 2026.
 * To change the rota, edit ANCHOR (first day of the cycle) or PATTERN below.
 */
const ROTA = {
  ANCHOR: { y: 2026, m: 6, d: 19 }, // 19 July 2026 (m is 0-based)
  PATTERN: ['N', 'N', 'N', 'N', 'O', 'O', 'O', 'O', 'D', 'D', 'D', 'D', 'O', 'O', 'O', 'O'],
  TIMES: {
    N: { start: '19:00', end: '07:00' },
    D: { start: '07:00', end: '19:00' },
  },
  LABELS: { N: 'Night shift', D: 'Day shift', O: 'Off' },
};

const MS_DAY = 86400000;

function localMidnight(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function dateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function cycleIndex(date) {
  const anchor = new Date(ROTA.ANCHOR.y, ROTA.ANCHOR.m, ROTA.ANCHOR.d);
  const days = Math.round((localMidnight(date) - anchor) / MS_DAY);
  const len = ROTA.PATTERN.length;
  return ((days % len) + len) % len;
}

/* Returns { code, label, times, run, runLength } where run is the 1-based
 * position within the current block of identical shifts (e.g. night 2 of 4). */
function shiftFor(date) {
  const idx = cycleIndex(date);
  const code = ROTA.PATTERN[idx];
  const len = ROTA.PATTERN.length;
  let start = idx;
  while (ROTA.PATTERN[((start - 1) % len + len) % len] === code) start--;
  let end = idx;
  while (ROTA.PATTERN[(end + 1) % len] === code) end++;
  return {
    code,
    label: ROTA.LABELS[code],
    times: ROTA.TIMES[code] || null,
    run: idx - start + 1,
    runLength: end - start + 1,
  };
}

function addDays(date, n) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);
}

/* Next n days of shifts starting from a date (inclusive). */
function upcomingShifts(from, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const d = addDays(from, i);
    out.push({ date: d, key: dateKey(d), ...shiftFor(d) });
  }
  return out;
}

/* Highlights the active nav link. */
function initNav() {
  const page = document.body.dataset.page;
  document.querySelectorAll('.nav a').forEach((a) => {
    if (a.dataset.page === page) a.classList.add('active');
  });
}
document.addEventListener('DOMContentLoaded', initNav);
