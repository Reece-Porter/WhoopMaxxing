/* Meal prep: Open Food Facts search + barcode scan, shift-aware meal sections,
 * macro totals vs daily targets. Data stays in this browser (localStorage).
 * (MyFitnessPal has no public API, so Open Food Facts — the open database that
 * powers many macro apps — is used instead.) */
(function () {
  const OFF_FIELDS = 'code,product_name,brands,nutriments,serving_size';
  const SECTION_LABELS = {
    N: ['Pre-shift meal', 'Midnight meal', 'Post-shift meal', 'Snacks'],
    D: ['Breakfast', 'Lunch', 'Post-shift dinner', 'Snacks'],
    O: ['Breakfast', 'Lunch', 'Dinner', 'Snacks'],
  };
  const MACROS = [
    ['kcal', 'Calories', 'kcal', 'var(--ink-2)'],
    ['protein', 'Protein', 'g', 'var(--c-blue)'],
    ['carbs', 'Carbs', 'g', 'var(--c-green)'],
    ['fat', 'Fat', 'g', 'var(--c-magenta)'],
  ];

  let selectedDate = dateKey(new Date());
  let pendingFood = null; // food chosen from search/scan, awaiting a section
  let scanStream = null;

  /* ---------- Open Food Facts ---------- */
  function foodFromProduct(p) {
    const n = p.nutriments || {};
    const per100 = {
      kcal: Math.round(n['energy-kcal_100g'] ?? (n.energy_100g ? n.energy_100g / 4.184 : 0)),
      protein: +(n.proteins_100g ?? 0).toFixed(1),
      carbs: +(n.carbohydrates_100g ?? 0).toFixed(1),
      fat: +(n.fat_100g ?? 0).toFixed(1),
    };
    return {
      name: p.product_name || 'Unnamed product',
      brand: p.brands ? p.brands.split(',')[0] : '',
      code: p.code || '',
      per100,
    };
  }

  async function searchByName(q) {
    const url =
      'https://world.openfoodfacts.org/cgi/search.pl?action=process&json=1&search_simple=1' +
      `&page_size=20&fields=${OFF_FIELDS}&search_terms=${encodeURIComponent(q)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Search failed (' + res.status + ')');
    const data = await res.json();
    return (data.products || []).filter((p) => p.product_name).map(foodFromProduct);
  }

  async function lookupBarcode(code) {
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=${OFF_FIELDS}`);
    if (!res.ok) throw new Error('Lookup failed (' + res.status + ')');
    const data = await res.json();
    if (data.status !== 1 || !data.product) return null;
    return foodFromProduct(data.product);
  }

  /* ---------- barcode scanning (native BarcodeDetector) ---------- */
  async function startScanner() {
    const msg = document.getElementById('scan-msg');
    if (!('BarcodeDetector' in window)) {
      msg.textContent = 'Camera scanning needs Chrome/Edge/Android. Type the barcode number below instead — it works everywhere.';
      return;
    }
    try {
      const detector = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'] });
      scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      const video = document.getElementById('scanner-video');
      video.hidden = false;
      video.srcObject = scanStream;
      await video.play();
      msg.textContent = 'Point the camera at the barcode…';
      document.getElementById('scan-start').hidden = true;
      document.getElementById('scan-stop').hidden = false;

      const tick = async () => {
        if (!scanStream) return;
        try {
          const codes = await detector.detect(video);
          if (codes.length) {
            const value = codes[0].rawValue;
            stopScanner();
            msg.textContent = `Found barcode ${value} — looking it up…`;
            await handleBarcode(value);
            return;
          }
        } catch { /* frame not ready yet */ }
        setTimeout(tick, 250);
      };
      tick();
    } catch (e) {
      msg.textContent = 'Could not open the camera (' + e.message + '). Type the barcode number below instead.';
    }
  }

  function stopScanner() {
    if (scanStream) {
      scanStream.getTracks().forEach((t) => t.stop());
      scanStream = null;
    }
    document.getElementById('scanner-video').hidden = true;
    document.getElementById('scan-start').hidden = false;
    document.getElementById('scan-stop').hidden = true;
  }

  async function handleBarcode(code) {
    const msg = document.getElementById('scan-msg');
    try {
      const food = await lookupBarcode(code);
      if (!food) {
        msg.textContent = `Barcode ${code} isn't in Open Food Facts. Try a name search instead.`;
        return;
      }
      msg.textContent = '';
      showResults([food]);
    } catch (e) {
      msg.textContent = 'Lookup error: ' + e.message;
    }
  }

  /* ---------- search results & adding ---------- */
  function macroLine(per100) {
    return `${per100.kcal} kcal · P ${per100.protein} · C ${per100.carbs} · F ${per100.fat} /100g`;
  }

  function showResults(foods) {
    const wrap = document.getElementById('results');
    wrap.innerHTML = '';
    if (!foods.length) {
      wrap.innerHTML = '<p class="notice">No results found.</p>';
      return;
    }
    for (const food of foods) {
      const row = document.createElement('div');
      row.className = 'search-result';
      row.innerHTML =
        `<div class="name">${escapeHtml(food.name)}${food.brand ? ` <span class="notice">· ${escapeHtml(food.brand)}</span>` : ''}` +
        `<div class="per">${macroLine(food.per100)}</div></div>`;
      const favBtn = document.createElement('button');
      favBtn.className = 'small ghost';
      favBtn.textContent = '☆ Save';
      favBtn.title = 'Save to favourites';
      favBtn.addEventListener('click', () => {
        const favs = getFavourites();
        if (!favs.some((f) => f.code === food.code && f.name === food.name)) {
          favs.push(food);
          setFavourites(favs);
          renderFavourites();
        }
        favBtn.textContent = '★ Saved';
      });
      const addBtn = document.createElement('button');
      addBtn.className = 'small primary';
      addBtn.textContent = 'Add';
      addBtn.addEventListener('click', () => beginAdd(food));
      row.append(favBtn, addBtn);
      wrap.appendChild(row);
    }
  }

  function beginAdd(food) {
    pendingFood = food;
    const dlg = document.getElementById('add-dialog');
    document.getElementById('add-food-name').textContent = food.name + (food.brand ? ` (${food.brand})` : '');
    document.getElementById('add-grams').value = 100;
    const sel = document.getElementById('add-section');
    const labels = SECTION_LABELS[shiftFor(parseKey(selectedDate)).code];
    sel.innerHTML = labels.map((l, i) => `<option value="${i}">${l}</option>`).join('');
    dlg.showModal();
  }

  /* ---------- plan rendering ---------- */
  function itemMacros(item) {
    const f = item.grams / 100;
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

    const labels = SECTION_LABELS[shift.code];
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
        const row = document.createElement('div');
        row.className = 'meal-item';
        row.innerHTML =
          `<div class="name">${escapeHtml(item.name)}${item.brand ? `<span class="brand"> · ${escapeHtml(item.brand)}</span>` : ''}</div>` +
          `<span class="macros">${m.kcal} kcal · P ${m.protein}g · C ${m.carbs}g · F ${m.fat}g</span>`;
        const grams = document.createElement('input');
        grams.type = 'number';
        grams.className = 'grams';
        grams.value = item.grams;
        grams.min = 1;
        grams.setAttribute('aria-label', 'grams');
        grams.addEventListener('change', () => {
          item.grams = Math.max(1, +grams.value || 100);
          saveDayPlan(plan);
          renderPlan();
        });
        const g = document.createElement('span');
        g.className = 'notice';
        g.textContent = 'g';
        const del = document.createElement('button');
        del.className = 'small ghost';
        del.textContent = '✕';
        del.setAttribute('aria-label', 'remove item');
        del.addEventListener('click', () => {
          items.splice(ii, 1);
          saveDayPlan(plan);
          renderPlan();
        });
        row.append(grams, g, del);
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

  function renderFavourites() {
    const favs = getFavourites();
    const wrap = document.getElementById('favourites');
    wrap.innerHTML = '';
    if (!favs.length) {
      wrap.innerHTML = '<p class="notice">Foods you star from search results appear here for quick re-adding.</p>';
      return;
    }
    favs.forEach((food, i) => {
      const row = document.createElement('div');
      row.className = 'search-result';
      row.innerHTML = `<div class="name">${escapeHtml(food.name)}${food.brand ? ` <span class="notice">· ${escapeHtml(food.brand)}</span>` : ''}<div class="per">${macroLine(food.per100)}</div></div>`;
      const rm = document.createElement('button');
      rm.className = 'small ghost';
      rm.textContent = '✕';
      rm.setAttribute('aria-label', 'remove favourite');
      rm.addEventListener('click', () => {
        favs.splice(i, 1);
        setFavourites(favs);
        renderFavourites();
      });
      const addBtn = document.createElement('button');
      addBtn.className = 'small primary';
      addBtn.textContent = 'Add';
      addBtn.addEventListener('click', () => beginAdd(food));
      row.append(rm, addBtn);
      wrap.appendChild(row);
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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
        showResults(await searchByName(q));
      } catch (e) {
        wrap.innerHTML = `<p class="error-text">Search error: ${escapeHtml(e.message)}. Check your connection and try again.</p>`;
      }
    });

    document.getElementById('barcode-form').addEventListener('submit', (ev) => {
      ev.preventDefault();
      const code = document.getElementById('barcode-q').value.trim();
      if (code) handleBarcode(code);
    });

    document.getElementById('scan-start').addEventListener('click', startScanner);
    document.getElementById('scan-stop').addEventListener('click', stopScanner);
    window.addEventListener('pagehide', stopScanner);

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

    renderFavourites();
    renderPlan();
  });
})();
