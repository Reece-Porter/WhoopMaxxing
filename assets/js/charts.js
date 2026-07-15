/* Minimal SVG line chart with crosshair hover + tooltip and a table view.
 * Usage: renderLineChart(containerEl, { title, unit, color, data: [{key:'YYYY-MM-DD', value}], yMin, yMax })
 */
(function () {
  const NS = 'http://www.w3.org/2000/svg';
  let tooltip;

  function getTooltip() {
    if (!tooltip) {
      tooltip = document.createElement('div');
      tooltip.className = 'viz-tooltip';
      document.body.appendChild(tooltip);
    }
    return tooltip;
  }

  function el(tag, attrs) {
    const node = document.createElementNS(NS, tag);
    for (const k in attrs) node.setAttribute(k, attrs[k]);
    return node;
  }

  function niceTicks(min, max, count) {
    const span = max - min || 1;
    const step = Math.pow(10, Math.floor(Math.log10(span / count)));
    const err = span / count / step;
    const mult = err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1;
    const s = step * mult;
    const ticks = [];
    for (let v = Math.ceil(min / s) * s; v <= max + 1e-9; v += s) ticks.push(+v.toFixed(6));
    return ticks;
  }

  function fmtDate(key) {
    const d = parseKey(key);
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  }

  window.renderLineChart = function (container, opts) {
    const { title, unit, color, data } = opts;
    container.classList.add('card', 'chart-card');
    container.innerHTML = '';

    const h3 = document.createElement('h3');
    h3.textContent = title;
    const unitEl = document.createElement('div');
    unitEl.className = 'unit';
    unitEl.textContent = unit;
    container.append(h3, unitEl);

    if (!data || data.length === 0) {
      const p = document.createElement('p');
      p.className = 'notice';
      p.textContent = 'No data yet — import or add entries above.';
      container.appendChild(p);
      return;
    }

    const W = 560, H = 200, pad = { t: 10, r: 12, b: 24, l: 40 };
    const vals = data.map((d) => d.value);
    let yMin = opts.yMin !== undefined ? opts.yMin : Math.min(...vals);
    let yMax = opts.yMax !== undefined ? opts.yMax : Math.max(...vals);
    if (yMin === yMax) { yMin -= 1; yMax += 1; }
    const spanPad = (yMax - yMin) * 0.1;
    if (opts.yMin === undefined) yMin -= spanPad;
    if (opts.yMax === undefined) yMax += spanPad;

    const x = (i) => pad.l + (data.length === 1 ? (W - pad.l - pad.r) / 2 : (i / (data.length - 1)) * (W - pad.l - pad.r));
    const y = (v) => pad.t + (1 - (v - yMin) / (yMax - yMin)) * (H - pad.t - pad.b);

    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart-svg', role: 'img', 'aria-label': `${title} chart` });

    // gridlines + y labels
    for (const t of niceTicks(yMin, yMax, 4)) {
      svg.appendChild(el('line', { x1: pad.l, x2: W - pad.r, y1: y(t), y2: y(t), stroke: 'var(--grid)', 'stroke-width': 1 }));
      const lbl = el('text', { x: pad.l - 6, y: y(t) + 4, 'text-anchor': 'end', 'font-size': 11, fill: 'var(--muted)' });
      lbl.textContent = t;
      svg.appendChild(lbl);
    }

    // x labels: first, middle, last
    const xIdx = data.length > 2 ? [0, Math.floor(data.length / 2), data.length - 1] : data.map((_, i) => i);
    for (const i of new Set(xIdx)) {
      const anchor = i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle';
      const lbl = el('text', { x: x(i), y: H - 6, 'text-anchor': anchor, 'font-size': 11, fill: 'var(--muted)' });
      lbl.textContent = fmtDate(data[i].key);
      svg.appendChild(lbl);
    }

    // area + line
    const pts = data.map((d, i) => `${x(i)},${y(d.value)}`).join(' ');
    if (data.length > 1) {
      const area = `${pad.l},${H - pad.b} ${pts} ${x(data.length - 1)},${H - pad.b}`;
      svg.appendChild(el('polygon', { points: area, fill: color, opacity: 0.08 }));
      svg.appendChild(el('polyline', { points: pts, fill: 'none', stroke: color, 'stroke-width': 2, 'stroke-linejoin': 'round' }));
    } else {
      svg.appendChild(el('circle', { cx: x(0), cy: y(data[0].value), r: 4, fill: color }));
    }

    // hover layer
    const cross = el('line', { y1: pad.t, y2: H - pad.b, stroke: 'var(--muted)', 'stroke-width': 1, 'stroke-dasharray': '3 3', visibility: 'hidden' });
    const dot = el('circle', { r: 4, fill: color, stroke: 'var(--surface)', 'stroke-width': 2, visibility: 'hidden' });
    svg.append(cross, dot);

    const tt = getTooltip();
    svg.addEventListener('pointermove', (ev) => {
      const rect = svg.getBoundingClientRect();
      const px = ((ev.clientX - rect.left) / rect.width) * W;
      let i = Math.round(((px - pad.l) / (W - pad.l - pad.r)) * (data.length - 1));
      i = Math.max(0, Math.min(data.length - 1, i));
      cross.setAttribute('x1', x(i));
      cross.setAttribute('x2', x(i));
      cross.setAttribute('visibility', 'visible');
      dot.setAttribute('cx', x(i));
      dot.setAttribute('cy', y(data[i].value));
      dot.setAttribute('visibility', 'visible');
      tt.innerHTML = `<div class="tt-date">${fmtDate(data[i].key)}</div><div class="tt-val">${data[i].value}${unit ? ' ' + unit : ''}</div>`;
      tt.style.display = 'block';
      tt.style.left = Math.min(ev.clientX + 14, window.innerWidth - 140) + 'px';
      tt.style.top = ev.clientY + 14 + 'px';
    });
    svg.addEventListener('pointerleave', () => {
      cross.setAttribute('visibility', 'hidden');
      dot.setAttribute('visibility', 'hidden');
      tt.style.display = 'none';
    });

    container.appendChild(svg);

    // table view toggle (accessible alternative)
    const toggle = document.createElement('button');
    toggle.className = 'small ghost table-toggle';
    toggle.textContent = 'Table';
    const tableWrap = document.createElement('div');
    tableWrap.className = 'chart-table';
    tableWrap.hidden = true;
    const rows = data.map((d) => `<tr><td>${fmtDate(d.key)}</td><td class="num">${d.value}</td></tr>`).join('');
    tableWrap.innerHTML = `<table><thead><tr><th>Date</th><th class="num">${title}${unit ? ` (${unit})` : ''}</th></tr></thead><tbody>${rows}</tbody></table>`;
    toggle.addEventListener('click', () => {
      tableWrap.hidden = !tableWrap.hidden;
      svg.style.display = tableWrap.hidden ? 'block' : 'none';
      toggle.textContent = tableWrap.hidden ? 'Table' : 'Chart';
    });
    container.append(toggle, tableWrap);
  };
})();
