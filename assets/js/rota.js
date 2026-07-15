/* Rota page: month calendar rendered from the shift engine. */
(function () {
  let view = new Date();
  view = new Date(view.getFullYear(), view.getMonth(), 1);

  const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  function render() {
    const title = document.getElementById('cal-title');
    title.textContent = view.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

    const grid = document.getElementById('cal-grid');
    grid.innerHTML = '';
    for (const d of DOW) {
      const c = document.createElement('div');
      c.className = 'cal-dow';
      c.textContent = d;
      grid.appendChild(c);
    }

    const first = new Date(view.getFullYear(), view.getMonth(), 1);
    const lead = (first.getDay() + 6) % 7; // Monday-first
    const start = addDays(first, -lead);
    const todayKey = dateKey(new Date());

    for (let i = 0; i < 42; i++) {
      const d = addDays(start, i);
      const s = shiftFor(d);
      const cell = document.createElement('div');
      cell.className = `cal-cell shift-${s.code}`;
      if (d.getMonth() !== view.getMonth()) cell.classList.add('out');
      if (dateKey(d) === todayKey) cell.classList.add('today');

      const tag = s.code === 'O' ? 'OFF' : `${s.code === 'N' ? 'NIGHT' : 'DAY'} ${s.run}/${s.runLength}`;
      cell.innerHTML =
        `<span class="dnum">${d.getDate()}</span>` +
        `<br><span class="shift-tag">${tag}</span>` +
        (s.times ? `<span class="times">${s.times.start}–${s.times.end}</span>` : '');
      grid.appendChild(cell);
    }

    // next shift summary
    const now = new Date();
    const next = upcomingShifts(now, 32).find((u) => u.code !== 'O');
    const today = shiftFor(now);
    const sum = document.getElementById('rota-summary');
    const todayLine =
      today.code === 'O'
        ? `Today is a rest day (day ${today.run} of ${today.runLength} off).`
        : `Today is ${today.label.toLowerCase()} ${today.run} of ${today.runLength} (${today.times.start}–${today.times.end}).`;
    let nextLine = '';
    if (today.code === 'O' && next) {
      nextLine = ` Next block: ${next.label.toLowerCase()}s starting ${next.date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}.`;
    }
    sum.textContent = todayLine + nextLine;
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('cal-prev').addEventListener('click', () => {
      view = new Date(view.getFullYear(), view.getMonth() - 1, 1);
      render();
    });
    document.getElementById('cal-next').addEventListener('click', () => {
      view = new Date(view.getFullYear(), view.getMonth() + 1, 1);
      render();
    });
    document.getElementById('cal-today').addEventListener('click', () => {
      const n = new Date();
      view = new Date(n.getFullYear(), n.getMonth(), 1);
      render();
    });
    render();
  });
})();
