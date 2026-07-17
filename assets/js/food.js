/* Shared food helpers: Open Food Facts lookup, barcode scanning, result/favourite
 * rendering, and shift-aware meal section labels. Used by meals.js and batches.js.
 * Expects the page to have (for scanning): #scanner-video, #scan-msg, #scan-start, #scan-stop. */
const Food = (() => {
  const OFF_FIELDS = 'code,product_name,brands,nutriments,serving_size';

  const SECTION_LABELS = {
    N: ['Pre-shift meal', 'Midnight meal', 'Post-shift meal', 'Snacks'],
    D: ['Breakfast', 'Lunch', 'Post-shift dinner', 'Snacks'],
    O: ['Breakfast', 'Lunch', 'Dinner', 'Snacks'],
  };

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

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

  function macroLine(per100) {
    return `${per100.kcal} kcal · P ${per100.protein} · C ${per100.carbs} · F ${per100.fat} /100g`;
  }

  /* ---------- barcode scanning (native BarcodeDetector) ---------- */
  let scanStream = null;

  async function startScanner(onCode) {
    const msg = document.getElementById('scan-msg');
    if (!('BarcodeDetector' in window)) {
      msg.textContent = 'Camera scanning needs Chrome/Edge/Android. Type the barcode number instead — it works everywhere.';
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
            await onCode(value);
            return;
          }
        } catch { /* frame not ready yet */ }
        setTimeout(tick, 250);
      };
      tick();
    } catch (e) {
      msg.textContent = 'Could not open the camera (' + e.message + '). Type the barcode number instead.';
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

  /* ---------- shared result / favourites rendering ---------- */
  function renderResults(wrap, foods, { onAdd, onFavChange } = {}) {
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
      favBtn.innerHTML = SM.icon('plus') + 'Save';
      favBtn.title = 'Save to favourites';
      favBtn.addEventListener('click', () => {
        const favs = getFavourites();
        if (!favs.some((f) => f.code === food.code && f.name === food.name)) {
          favs.push(food);
          setFavourites(favs);
          if (onFavChange) onFavChange();
        }
        favBtn.innerHTML = SM.icon('check') + 'Saved';
      });
      const addBtn = document.createElement('button');
      addBtn.className = 'small primary';
      addBtn.textContent = 'Add';
      addBtn.addEventListener('click', () => onAdd(food));
      row.append(favBtn, addBtn);
      wrap.appendChild(row);
    }
  }

  function renderFavourites(wrap, { onAdd, onFavChange } = {}) {
    const favs = getFavourites();
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
        if (onFavChange) onFavChange();
        else renderFavourites(wrap, { onAdd });
      });
      const addBtn = document.createElement('button');
      addBtn.className = 'small primary';
      addBtn.textContent = 'Add';
      addBtn.addEventListener('click', () => onAdd(food));
      row.append(rm, addBtn);
      wrap.appendChild(row);
    });
  }

  return { SECTION_LABELS, escapeHtml, foodFromProduct, searchByName, lookupBarcode, macroLine, startScanner, stopScanner, renderResults, renderFavourites };
})();
