/* Batch cook: build big-batch recipes from ingredients, split into portions,
 * see per-portion macros, and push portions into the meal plan. */
(function () {
  let batches = getBatches();
  let pendingFood = null;    // ingredient awaiting a gram amount
  let portionBatchId = null; // batch awaiting add-to-plan

  const byId = (id) => document.getElementById(id);

  function save() {
    setBatches(batches);
    render();
  }

  function ingredientMacros(item) {
    const f = item.grams / 100;
    return {
      kcal: Math.round(item.per100.kcal * f),
      protein: +(item.per100.protein * f).toFixed(1),
      carbs: +(item.per100.carbs * f).toFixed(1),
      fat: +(item.per100.fat * f).toFixed(1),
    };
  }

  function batchTotals(batch) {
    const t = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
    for (const item of batch.items) {
      const m = ingredientMacros(item);
      for (const k in t) t[k] += m[k];
    }
    return t;
  }

  function perPortion(batch) {
    const t = batchTotals(batch);
    const n = Math.max(1, batch.portions);
    return {
      kcal: Math.round(t.kcal / n),
      protein: +(t.protein / n).toFixed(1),
      carbs: +(t.carbs / n).toFixed(1),
      fat: +(t.fat / n).toFixed(1),
    };
  }

  function currentBatch() {
    const id = +byId('target-batch').value;
    return batches.find((b) => b.id === id) || batches[0] || null;
  }

  /* ---------- rendering ---------- */
  function renderTargetSelect() {
    const sel = byId('target-batch');
    const prev = +sel.value;
    sel.innerHTML = batches.length
      ? batches.map((b) => `<option value="${b.id}">${Food.escapeHtml(b.name)}</option>`).join('')
      : '<option value="">— create a batch first —</option>';
    if (batches.some((b) => b.id === prev)) sel.value = prev;
  }

  function batchCard(batch) {
    const card = document.createElement('div');
    card.className = 'card';
    card.style.marginTop = '12px';
    const totals = batchTotals(batch);
    const pp = perPortion(batch);

    const head = document.createElement('h2');
    head.style.cssText = 'margin-top:0;display:flex;justify-content:space-between;align-items:baseline;gap:10px;flex-wrap:wrap';
    head.innerHTML = `${Food.escapeHtml(batch.name)} <span class="notice" style="font-weight:500">${totals.kcal} kcal whole batch</span>`;
    card.appendChild(head);

    // ingredient rows
    const list = document.createElement('div');
    batch.items.forEach((item, ii) => {
      const m = ingredientMacros(item);
      const row = document.createElement('div');
      row.className = 'meal-item';
      row.innerHTML =
        `<div class="name">${Food.escapeHtml(item.name)}${item.brand ? `<span class="brand"> · ${Food.escapeHtml(item.brand)}</span>` : ''}</div>` +
        `<span class="macros">${m.kcal} kcal · P ${m.protein}g · C ${m.carbs}g · F ${m.fat}g</span>`;
      const grams = document.createElement('input');
      grams.type = 'number';
      grams.className = 'grams';
      grams.value = item.grams;
      grams.min = 1;
      grams.setAttribute('aria-label', 'grams in batch');
      grams.addEventListener('change', () => {
        item.grams = Math.max(1, +grams.value || 100);
        save();
      });
      const g = document.createElement('span');
      g.className = 'notice';
      g.textContent = 'g';
      const del = document.createElement('button');
      del.className = 'small ghost';
      del.textContent = '✕';
      del.setAttribute('aria-label', 'remove ingredient');
      del.addEventListener('click', () => {
        batch.items.splice(ii, 1);
        save();
      });
      row.append(grams, g, del);
      list.appendChild(row);
    });
    if (!batch.items.length) {
      const p = document.createElement('p');
      p.className = 'notice';
      p.textContent = 'No ingredients yet — search or scan on the left (make sure this batch is selected as the target).';
      list.appendChild(p);
    }
    card.appendChild(list);

    // portion split + per-portion summary
    const split = document.createElement('div');
    split.className = 'form-row';
    split.style.marginTop = '12px';
    split.innerHTML = `<label class="field">Split into
      <input type="number" class="portions" min="1" max="40" step="1" value="${batch.portions}" style="width:70px" aria-label="number of portions">
    </label>`;
    const summary = document.createElement('div');
    summary.style.cssText = 'flex:1;min-width:220px';
    summary.innerHTML =
      `<div style="color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.06em">Per portion (of ${batch.portions})</div>` +
      `<div style="font-size:18px;font-weight:700">${pp.kcal} kcal <span style="font-weight:500;color:var(--ink-2);font-size:14px">· P ${pp.protein}g · C ${pp.carbs}g · F ${pp.fat}g</span></div>`;
    split.appendChild(summary);
    split.querySelector('.portions').addEventListener('change', (ev) => {
      batch.portions = Math.max(1, Math.round(+ev.target.value || 1));
      save();
    });
    card.appendChild(split);

    // actions
    const actions = document.createElement('div');
    actions.style.cssText = 'margin-top:12px;display:flex;gap:8px;flex-wrap:wrap';
    const toPlan = document.createElement('button');
    toPlan.className = 'small primary';
    toPlan.textContent = 'Add portion(s) to meal plan';
    toPlan.disabled = !batch.items.length;
    toPlan.addEventListener('click', () => beginAddPortion(batch));
    const rm = document.createElement('button');
    rm.className = 'small ghost';
    rm.textContent = 'Delete batch';
    rm.addEventListener('click', () => {
      if (confirm(`Delete "${batch.name}"? (Portions already added to meal plans stay there.)`)) {
        batches = batches.filter((b) => b.id !== batch.id);
        save();
      }
    });
    actions.append(toPlan, rm);
    card.appendChild(actions);
    return card;
  }

  function render() {
    renderTargetSelect();
    const wrap = byId('batches');
    wrap.innerHTML = '';
    if (!batches.length) {
      wrap.innerHTML = '<div class="card" style="margin-top:12px"><p class="notice" style="margin:0">No batches yet. Name one above (e.g. "Chilli — 6 boxes"), then add each ingredient with the amount you actually cooked with. Set how many boxes you split it into and the per-portion macros appear here.</p></div>';
      return;
    }
    for (const batch of batches) wrap.appendChild(batchCard(batch));
  }

  /* ---------- adding ingredients ---------- */
  function beginAddIngredient(food) {
    const batch = currentBatch();
    if (!batch) {
      alert('Create a batch first (right-hand side), then add ingredients to it.');
      return;
    }
    pendingFood = food;
    byId('ing-name').textContent = `${food.name}${food.brand ? ` (${food.brand})` : ''} → ${batch.name}`;
    byId('ing-grams').value = 500;
    byId('ing-dialog').showModal();
  }

  async function handleBarcode(code) {
    const msg = byId('scan-msg');
    try {
      const food = await Food.lookupBarcode(code);
      if (!food) {
        msg.textContent = `Barcode ${code} isn't in Open Food Facts. Try a name search instead.`;
        return;
      }
      msg.textContent = '';
      Food.renderResults(byId('results'), [food], { onAdd: beginAddIngredient, onFavChange: renderFavs });
    } catch (e) {
      msg.textContent = 'Lookup error: ' + e.message;
    }
  }

  function renderFavs() {
    Food.renderFavourites(byId('favourites'), { onAdd: beginAddIngredient, onFavChange: renderFavs });
  }

  /* ---------- add portion(s) to the meal plan ---------- */
  function beginAddPortion(batch) {
    portionBatchId = batch.id;
    const pp = perPortion(batch);
    byId('portion-batch-name').textContent = `${batch.name} — ${pp.kcal} kcal · P ${pp.protein}g · C ${pp.carbs}g · F ${pp.fat}g per portion`;
    byId('portion-date').value = dateKey(new Date());
    byId('portion-qty').value = 1;
    fillPortionSections();
    byId('portion-dialog').showModal();
  }

  function fillPortionSections() {
    const dateVal = byId('portion-date').value;
    const code = dateVal ? shiftFor(parseKey(dateVal)).code : 'O';
    byId('portion-section').innerHTML = Food.SECTION_LABELS[code].map((l, i) => `<option value="${i}">${l}</option>`).join('');
  }

  /* ---------- wiring ---------- */
  document.addEventListener('DOMContentLoaded', () => {
    byId('batch-new').addEventListener('submit', (ev) => {
      ev.preventDefault();
      const name = byId('batch-name').value.trim();
      if (!name) return;
      const batch = { id: Date.now(), name, portions: 4, items: [] };
      batches.push(batch);
      byId('batch-name').value = '';
      save();
      byId('target-batch').value = String(batch.id);
    });

    byId('search-form').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const q = byId('search-q').value.trim();
      if (!q) return;
      const wrap = byId('results');
      wrap.innerHTML = '<p class="notice">Searching Open Food Facts…</p>';
      try {
        Food.renderResults(wrap, await Food.searchByName(q), { onAdd: beginAddIngredient, onFavChange: renderFavs });
      } catch (e) {
        wrap.innerHTML = `<p class="error-text">Search error: ${Food.escapeHtml(e.message)}. Check your connection and try again.</p>`;
      }
    });

    byId('barcode-form').addEventListener('submit', (ev) => {
      ev.preventDefault();
      const code = byId('barcode-q').value.trim();
      if (code) handleBarcode(code);
    });
    byId('scan-start').addEventListener('click', () => Food.startScanner(handleBarcode));
    byId('scan-stop').addEventListener('click', Food.stopScanner);
    window.addEventListener('pagehide', Food.stopScanner);

    byId('ing-form').addEventListener('submit', (ev) => {
      ev.preventDefault();
      const batch = currentBatch();
      if (!batch || !pendingFood) return;
      batch.items.push({ ...pendingFood, grams: Math.max(1, +byId('ing-grams').value || 100) });
      pendingFood = null;
      byId('ing-dialog').close();
      save();
    });
    byId('ing-cancel').addEventListener('click', () => byId('ing-dialog').close());

    byId('portion-date').addEventListener('change', fillPortionSections);
    byId('portion-form').addEventListener('submit', (ev) => {
      ev.preventDefault();
      const batch = batches.find((b) => b.id === portionBatchId);
      const dateVal = byId('portion-date').value;
      if (!batch || !dateVal) return;
      const qty = Math.max(0.25, +byId('portion-qty').value || 1);
      const si = +byId('portion-section').value;
      const plans = getMealPlans();
      const plan = plans[dateVal] || { sections: { 0: [], 1: [], 2: [], 3: [] } };
      plan.sections[si] = plan.sections[si] || [];
      plan.sections[si].push({
        name: batch.name,
        brand: 'batch portion',
        per100: perPortion(batch), // per-portion macros; grams = portion count
        grams: qty,
        unit: 'portion',
      });
      plans[dateVal] = plan;
      setMealPlans(plans);
      byId('portion-dialog').close();
      byId('scan-msg').textContent = `Added ${qty} portion${qty === 1 ? '' : 's'} of "${batch.name}" to ${dateVal}.`;
    });
    byId('portion-cancel').addEventListener('click', () => byId('portion-dialog').close());

    renderFavs();
    render();
  });
})();
