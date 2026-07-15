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

function getFavourites() {
  return Store.get('favs', []);
}
function setFavourites(f) {
  Store.set('favs', f);
}
