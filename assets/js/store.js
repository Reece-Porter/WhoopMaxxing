/* Tiny localStorage wrapper. All app data lives in the browser under wm.* keys. */
const Store = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem('wm.' + key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    localStorage.setItem('wm.' + key, JSON.stringify(value));
  },
};

/* Whoop records: { 'YYYY-MM-DD': { recovery, hrv, rhr, sleepH, sleepPerf, strain } } */
function getWhoopData() {
  return Store.get('whoop', {});
}
function setWhoopData(data) {
  Store.set('whoop', data);
}

/* Meal plans: { 'YYYY-MM-DD': { sections: { 0:[items], 1:[], 2:[], 3:[] } } }
 * item: { name, brand, per100: {kcal,protein,carbs,fat}, grams } */
function getMealPlans() {
  return Store.get('meals', {});
}
function setMealPlans(data) {
  Store.set('meals', data);
}

function getTargets() {
  return Store.get('targets', { kcal: 2500, protein: 160, carbs: 280, fat: 80 });
}
function setTargets(t) {
  Store.set('targets', t);
}

/* Merges data/whoop.json (written by the Whoop-sync GitHub Action, if set up)
 * into the local store. Resolves with the sync timestamp, or null if the file
 * doesn't exist / can't be fetched (e.g. opened from disk). */
async function loadRepoWhoopData() {
  try {
    const res = await fetch('data/whoop.json', { cache: 'no-store' });
    if (!res.ok) return null;
    const json = await res.json();
    if (!json || !json.days) return null;
    const data = getWhoopData();
    for (const key in json.days) data[key] = { ...(data[key] || {}), ...json.days[key] };
    setWhoopData(data);
    return json.updated || null;
  } catch {
    return null;
  }
}

function getFavourites() {
  return Store.get('favs', []);
}
function setFavourites(f) {
  Store.set('favs', f);
}

/* Batch-cook recipes: [{ id, name, portions, items: [{name, brand, per100, grams}] }] */
function getBatches() {
  return Store.get('batches', []);
}
function setBatches(b) {
  Store.set('batches', b);
}
