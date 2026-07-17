/* Meal prep: Open Food Facts search + barcode scan (shared via food.js),
 * shift-aware meal sections, macro totals vs daily targets, and Whoop-driven
 * intake recommendations. Data stays in this browser (localStorage).
 * (MyFitnessPal has no public API, so Open Food Facts — the open database that
 * powers many macro apps — is used instead.) */
(function () {
  const MACROS = [
    ['kcal', 'Calories', 'kcal', 'var(--ink-2)'],
    ['protein', 'Protein', 'g', 'var(--c-blue)'],
    ['carbs', 'Carbs', 'g', 'var(--c-green)'],
    ['fat', 'Fat', 'g', 'var(--c-magenta)'],
  ];

  let selectedDate = dateKey(new Date());
  let pendingFood = null; // food chosen from search/scan, awaiting a section

  async function handleBarcode(code) {
    const msg = document.getElementById('scan-msg');
    try {
      const food = await Food.lookupBarcode(code);
      if (!food) {
        msg.textContent = `Barcode ${code} isn't in Open Food Facts. Try a name search instead.`;
        return;
      }
      msg.textContent = '';
      Food.renderResults(document.getElementById('results'), [food], { onAdd: beginAdd, onFavChange: renderFavs });
    } catch (e) {
      msg.textContent = 'Lookup error: ' + e.message;
    }
  }

  function renderFavs() {
    Food.renderFavourites(document.getElementById('favourites'), { onAdd: beginAdd, onFavChange: renderFavs });
  }

  /* Preselect the meal slot from the clock and that day's shift, so adding
   * food usually needs no slot choice at all (still overridable). */
  function suggestSection(code) {
    const h = new Date().getHours();
    if (code === 'N') {
      if (h >= 12 && h < 19) return 0;  // pre-shift meal
      if (h >= 22 || h < 4) return 1;   // midnight meal
      if (h >= 4 && h < 11) return 2;   // post-shift meal
      return 3;
    }
    if (code === 'D') {
      if (h < 10) return 0;             // breakfast
      if (h < 15) return 1;             // lunch
      if (h < 22) return 2;             // post-shift dinner
      return 3;
    }
    if (h < 11) return 0;
    if (h < 15) return 1;
    if (h < 21) return 2;
    return 3;
  }

  function beginAdd(food) {
    pendingFood = food;
    const dlg = document.getElementById('add-dialog');
    document.getElementById('add-food-name').textContent = food.name + (food.brand ? ` (${food.brand})` : '');
    document.getElementById('add-grams').value = 100;
    const sel = document.getElementById('add-section');
    const code = shiftFor(parseKey(selectedDate)).code;
    const labels = Food.SECTION_LABELS[code];
    sel.innerHTML = labels.map((l, i) => `<option value="${i}">${l}</option>`).join('');
    if (selectedDate === dateKey(new Date())) sel.value = String(suggestSection(code));
    dlg.showModal();
  }

  /* ---------- plan rendering ---------- */
  /* Items are per-100g by default; batch portions use unit:'portion' where
   * per100 holds per-portion macros and grams holds the number of portions. */
  function itemMacros(item) {
    const f = item.unit === 'portion' ? item.grams : item.grams / 100;
    return {
      kcal: Math.round(item.per100.kcal * f),
      protein: +(item.per100.protein * f).toFixed(1),
      carbs: +(item.per100.carbs * f).toFixed(1),
      fat: +(item.per100.fat * f).toFixed(1),
    };
  }

  function getDayPlan() {
    const plans = getMealPlans();
    return plans[selectedDate] || { sections: { 0: [], 1: [], 2: [], 3: [] } };
  }

  function saveDayPlan(plan) {
    const plans = getMealPlans();
    plans[selectedDate] = plan;
    setMealPlans(plans);
  }

  function renderPlan() {
    const date = parseKey(selectedDate);
    const shift = shiftFor(date);
    document.getElementById('plan-shift').innerHTML =
      `<span class="chip"><span class="dot" style="background:${shift.code === 'N' ? 'var(--shift-night)' : shift.code === 'D' ? 'var(--shift-day)' : 'var(--muted)'}"></span>` +
      `${shift.label}${shift.times ? ` ${shift.times.start}–${shift.times.end}` : ''}</span>`;

    const labels = Food.SECTION_LABELS[shift.code];
    const plan = getDayPlan();
    const wrap = document.getElementById('meal-sections');
    wrap.innerHTML = '';
    const totals = { kcal: 0, protein: 0, carbs: 0, fat: 0 };

    labels.forEach((label, si) => {
      const items = plan.sections[si] || [];
      const section = document.createElement('div');
      section.className = 'meal-section';
      let secKcal = 0;
      const list = document.createElement('div');
      items.forEach((item, ii) => {
        const m = itemMacros(item);
        secKcal += m.kcal;
        for (const k in totals) totals[k] += m[k];
        const isPortion = item.unit === 'portion';
        const row = document.createElement('div');
        row.className = 'meal-item';
        row.innerHTML =
          `<div class="name">${Food.escapeHtml(item.name)}${item.brand ? `<span class="brand"> · ${Food.escapeHtml(item.brand)}</span>` : ''}</div>` +
          `<span class="macros">${m.kcal} kcal · P ${m.protein}g · C ${m.carbs}g · F ${m.fat}g</span>`;
        const amount = document.createElement('input');
        amount.type = 'number';
        amount.className = 'grams';
        amount.value = item.grams;
        amount.min = isPortion ? 0.25 : 1;
        amount.step = isPortion ? 0.25 : 1;
        amount.setAttribute('aria-label', isPortion ? 'portions' : 'grams');
        amount.addEventListener('change', () => {
          item.grams = Math.max(isPortion ? 0.25 : 1, +amount.value || (isPortion ? 1 : 100));
          saveDayPlan(plan);
          renderPlan();
        });
        const g = document.createElement('span');
        g.className = 'notice';
        g.textContent = isPortion ? (item.grams === 1 ? 'portion' : 'portions') : 'g';
        const del = document.createElement('button');
        del.className = 'small ghost';
        del.textContent = '✕';
        del.setAttribute('aria-label', 'remove item');
        del.addEventListener('click', () => {
          items.splice(ii, 1);
          saveDayPlan(plan);
          renderPlan();
        });
        row.append(amount, g, del);
        list.appendChild(row);
      });
      const h = document.createElement('h3');
      h.innerHTML = `${label} <span class="kcal">${secKcal} kcal</span>`;
      section.append(h, list);
      if (!items.length) {
        const p = document.createElement('p');
        p.className = 'notice';
        p.textContent = 'Nothing planned — search or scan a food to add it here.';
        section.appendChild(p);
      }
      wrap.appendChild(section);
    });

    renderTotals(totals);
  }

  function renderTotals(totals) {
    const targets = getTargets();
    const wrap = document.getElementById('totals');
    wrap.innerHTML = '';
    for (const [key, label, unit, color] of MACROS) {
      const val = key === 'kcal' ? Math.round(totals[key]) : +totals[key].toFixed(0);
      const target = targets[key];
      const pct = Math.min(100, (val / target) * 100);
      const row = document.createElement('div');
      row.className = 'macro-row';
      row.innerHTML =
        `<div class="macro-head"><span>${label}</span><span class="val">${val} / ${target} ${unit}</span></div>` +
        `<div class="progress"><div style="width:${pct}%;background:${color}"></div></div>`;
      wrap.appendChild(row);
    }
  }

  /* ---------- recommended intake from Whoop burn + body stats ---------- */
  function getBody() {
    return Store.get('body', { weightKg: 72, heightCm: 176.5, age: 25, sex: 'male', goal: 'maintain' });
  }

  /* Average measured Whoop burn over the most recent days that have it. */
  function whoopBurn() {
    const data = getWhoopData();
    const vals = Object.keys(data)
      .sort()
      .map((k) => data[k].calories)
      .filter((v) => v !== undefined)
      .slice(-7);
    if (vals.length < 2) return null;
    return { kcal: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length), days: vals.length };
  }

  function latestRecovery() {
    const data = getWhoopData();
    const keys = Object.keys(data).sort();
    for (let i = keys.length - 1; i >= 0; i--) {
      if (data[keys[i]].recovery !== undefined) return data[keys[i]].recovery;
    }
    return null;
  }

  function computeIntake() {
    const b = getBody();
    const burn = whoopBurn();
    // Mifflin-St Jeor estimate, ~1.5 activity factor for an on-your-feet shift job
    const bmr = 10 * b.weightKg + 6.25 * b.heightCm - 5 * b.age + (b.sex === 'male' ? 5 : -161);
    const estimate = Math.round(bmr * 1.5);
    let kcalBase, basis;
    if (burn && burn.kcal >= bmr) {
      kcalBase = burn.kcal;
      basis = `your average Whoop burn over the last ${burn.days} days (${burn.kcal} kcal)`;
    } else if (burn) {
      // measured average below BMR = partial days (new strap / not worn all day)
      kcalBase = estimate;
      basis = `an estimate from your height/weight/age — your Whoop burn average (${burn.kcal} kcal) looks like partial days, so it's ignored until a full week of wear`;
    } else {
      kcalBase = estimate;
      basis = `an estimate from your height/weight/age (no Whoop calorie data yet — sync to switch to measured burn)`;
    }
    const adj = b.goal === 'lose' ? -400 : b.goal === 'gain' ? 300 : 0;
    const kcal = kcalBase + adj;
    const protein = Math.round((b.goal === 'lose' ? 2.0 : 1.8) * b.weightKg);
    const fat = Math.round(0.9 * b.weightKg);
    const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
    return { kcal, protein, carbs, fat, basis, goal: b.goal };
  }

  function renderIntake() {
    const wrap = document.getElementById('intake');
    const r = computeIntake();
    const goalWord = { maintain: 'maintain weight', lose: 'lose fat (−400 kcal/day)', gain: 'build muscle (+300 kcal/day)' }[r.goal];

    let tip = '';
    const shift = shiftFor(new Date());
    const rec = latestRecovery();
    if (shift.code === 'N') tip = 'Night shift today: eat your biggest meal pre-shift, keep midnight food light, and hit the protein target across the whole 24 h.';
    else if (rec !== null && rec < 34) tip = 'Recovery is red: hold calories at target, lean into protein and carbs, and skip the deficit today if you\'re cutting — recovery comes first.';
    else if (shift.code === 'D') tip = 'Day shift: front-load breakfast and pack the post-shift dinner — the target is easiest to hit when it\'s prepped.';

    wrap.innerHTML =
      `<div class="grid cols-4" style="margin-bottom:10px">` +
      [['Calories', r.kcal, 'kcal'], ['Protein', r.protein, 'g'], ['Carbs', r.carbs, 'g'], ['Fat', r.fat, 'g']]
        .map(([l, v, u]) => `<div class="tile"><div class="label">${l}</div><div class="value" style="font-size:22px">${v}<small> ${u}</small></div></div>`)
        .join('') +
      `</div>` +
      `<p class="notice" style="margin:0 0 10px">Based on ${r.basis}, protein at ${r.goal === 'lose' ? 2.0 : 1.8} g/kg and fat at 0.9 g/kg for your ${getBody().weightKg} kg, set to ${goalWord}.` +
      (tip ? ` ${tip}` : '') + `</p>`;

    const apply = document.createElement('button');
    apply.className = 'small primary';
    apply.textContent = 'Use as my daily targets';
    apply.addEventListener('click', () => {
      setTargets({ kcal: r.kcal, protein: r.protein, carbs: r.carbs, fat: r.fat });
      const tform = document.getElementById('targets-form');
      for (const [key] of MACROS) tform[key].value = getTargets()[key];
      renderPlan();
      apply.textContent = 'Applied';
      setTimeout(() => { apply.textContent = 'Use as my daily targets'; }, 2000);
    });
    wrap.appendChild(apply);
  }

  /* Low-recovery banner: surfaces the Whoop signal where food decisions happen,
   * with a one-click higher-carb variant of today's targets. */
  function renderRecoveryBanner() {
    const host = document.getElementById('meals-banner');
    if (!host) return;
    const rec = latestRecovery();
    if (rec === null || rec >= 34) { host.innerHTML = ''; return; }
    const t = getTargets();
    const shiftCarbs = Math.round(t.carbs * 1.2);
    const shiftFat = Math.max(40, Math.round((t.kcal - t.protein * 4 - shiftCarbs * 4) / 9));
    host.innerHTML = SM.banner('warn', 'alert', `Recovery is low today (${rec}%)`,
      `Fuelling matters more than dieting on days like this: hold calories at target, keep protein up, and lean carbs over fat to restock glycogen. ` +
      `<button id="carb-shift" class="small" style="margin-top:8px">Use higher-carb split today (${shiftCarbs}g carbs / ${shiftFat}g fat)</button>`);
    document.getElementById('carb-shift').addEventListener('click', () => {
      setTargets({ ...t, carbs: shiftCarbs, fat: shiftFat });
      const tform = document.getElementById('targets-form');
      for (const [key] of MACROS) tform[key].value = getTargets()[key];
      renderPlan();
      renderRecoveryBanner();
      host.insertAdjacentHTML('beforeend', '<p class="notice" style="margin:6px 0 0">Applied — today\'s targets now favour carbs. Tomorrow\'s recommendation resets as normal.</p>');
    });
  }

  function initBodyForm() {
    const form = document.getElementById('body-form');
    const b = getBody();
    for (const f of ['weightKg', 'heightCm', 'age', 'sex', 'goal']) form[f].value = b[f];
    form.addEventListener('change', () => {
      Store.set('body', {
        weightKg: +form.weightKg.value || 72,
        heightCm: +form.heightCm.value || 176.5,
        age: +form.age.value || 25,
        sex: form.sex.value,
        goal: form.goal.value,
      });
      renderIntake();
    });
  }

  /* ---------- wiring ---------- */
  document.addEventListener('DOMContentLoaded', () => {
    const dateInput = document.getElementById('plan-date');
    dateInput.value = selectedDate;
    dateInput.addEventListener('change', () => {
      if (dateInput.value) {
        selectedDate = dateInput.value;
        renderPlan();
      }
    });

    document.getElementById('search-form').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const q = document.getElementById('search-q').value.trim();
      if (!q) return;
      const wrap = document.getElementById('results');
      wrap.innerHTML = '<p class="notice">Searching Open Food Facts…</p>';
      try {
        Food.renderResults(wrap, await Food.searchByName(q), { onAdd: beginAdd, onFavChange: renderFavs });
      } catch (e) {
        wrap.innerHTML = `<p class="error-text">Search error: ${Food.escapeHtml(e.message)}. Check your connection and try again.</p>`;
      }
    });

    document.getElementById('barcode-form').addEventListener('submit', (ev) => {
      ev.preventDefault();
      const code = document.getElementById('barcode-q').value.trim();
      if (code) handleBarcode(code);
    });

    document.getElementById('scan-start').addEventListener('click', () => Food.startScanner(handleBarcode));
    document.getElementById('scan-stop').addEventListener('click', Food.stopScanner);
    window.addEventListener('pagehide', Food.stopScanner);

    document.getElementById('add-form').addEventListener('submit', (ev) => {
      ev.preventDefault();
      if (!pendingFood) return;
      const plan = getDayPlan();
      const si = +document.getElementById('add-section').value;
      plan.sections[si] = plan.sections[si] || [];
      plan.sections[si].push({ ...pendingFood, grams: Math.max(1, +document.getElementById('add-grams').value || 100) });
      saveDayPlan(plan);
      pendingFood = null;
      document.getElementById('add-dialog').close();
      renderPlan();
    });
    document.getElementById('add-cancel').addEventListener('click', () => document.getElementById('add-dialog').close());

    // targets
    const tform = document.getElementById('targets-form');
    const targets = getTargets();
    for (const [key] of MACROS) tform[key].value = targets[key];
    tform.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const t = {};
      for (const [key] of MACROS) t[key] = Math.max(0, +tform[key].value || 0);
      setTargets(t);
      renderPlan();
    });

    renderFavs();
    renderPlan();
    initBodyForm();
    renderIntake();
    renderRecoveryBanner();
    loadRepoWhoopData().then((updated) => {
      if (updated) {
        renderIntake();
        renderRecoveryBanner();
        SM.renderTodayStrip();
      }
    });
  });
})();
