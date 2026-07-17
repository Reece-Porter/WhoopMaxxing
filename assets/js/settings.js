/* Settings: body stats & goal, daily targets, rota summary, sync status,
 * and data controls (backup / selective clear). */
(function () {
  const byId = (id) => document.getElementById(id);
  const flash = (id, text) => {
    const el = byId(id);
    el.textContent = text;
    setTimeout(() => { el.textContent = ''; }, 2500);
  };

  document.addEventListener('DOMContentLoaded', () => {
    // body & goal (same store the Meal prep page uses)
    const bodyForm = byId('body-form');
    const b = Store.get('body', { weightKg: 72, heightCm: 176.5, age: 25, sex: 'male', goal: 'maintain' });
    for (const f of ['weightKg', 'heightCm', 'age', 'sex', 'goal']) bodyForm[f].value = b[f];
    bodyForm.addEventListener('change', () => {
      Store.set('body', {
        weightKg: +bodyForm.weightKg.value || 72,
        heightCm: +bodyForm.heightCm.value || 176.5,
        age: +bodyForm.age.value || 25,
        sex: bodyForm.sex.value,
        goal: bodyForm.goal.value,
      });
      flash('body-saved', 'Saved.');
    });

    // daily targets
    const tform = byId('targets-form');
    const t = getTargets();
    for (const k of ['kcal', 'protein', 'carbs', 'fat']) tform[k].value = t[k];
    tform.addEventListener('submit', (ev) => {
      ev.preventDefault();
      setTargets({
        kcal: Math.max(0, +tform.kcal.value || 0),
        protein: Math.max(0, +tform.protein.value || 0),
        carbs: Math.max(0, +tform.carbs.value || 0),
        fat: Math.max(0, +tform.fat.value || 0),
      });
      flash('targets-saved', 'Saved.');
    });

    // rota summary
    const anchor = new Date(ROTA.ANCHOR.y, ROTA.ANCHOR.m, ROTA.ANCHOR.d);
    byId('rota-info').textContent =
      `Pattern: ${ROTA.PATTERN.join('')} (4 nights → 4 off → 4 days → 4 off), anchored to ${anchor.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}. ` +
      `Nights ${ROTA.TIMES.N.start}–${ROTA.TIMES.N.end}, days ${ROTA.TIMES.D.start}–${ROTA.TIMES.D.end}.`;

    // sync status
    loadRepoWhoopData().then((updated) => {
      byId('sync-info').textContent = updated
        ? `Auto-sync is working — last sync ${new Date(updated).toLocaleString()}.`
        : 'No synced data found. If you haven\'t connected Whoop yet, start with "Connect / re-authorise Whoop" below. If you have, check the Whoop sync workflow on GitHub.';
      refreshDataInfo();
    });

    // data controls
    const refreshDataInfo = () => {
      const whoopDays = Object.keys(getWhoopData()).length;
      const planDays = Object.keys(getMealPlans()).length;
      byId('data-info').textContent =
        `${whoopDays} days of Whoop data · ${planDays} planned days · ${getBatches().length} batches · ${getFavourites().length} favourite foods stored in this browser.`;
    };
    refreshDataInfo();

    byId('export-data').addEventListener('click', () => {
      const backup = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k.startsWith('wm.') && k !== 'wm.ghsync') backup[k] = localStorage.getItem(k); // token stays out of backups
      }
      const blob = new Blob([JSON.stringify(backup, null, 1)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `shiftmaxx-backup-${dateKey(new Date())}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    });

    const clears = [
      ['clear-meals', 'meal plans', () => setMealPlans({})],
      ['clear-batches', 'batches', () => setBatches([])],
      ['clear-whoop', 'Whoop data', () => setWhoopData({})],
    ];
    for (const [id, label, fn] of clears) {
      byId(id).addEventListener('click', () => {
        if (confirm(`Clear all ${label} from this browser? Download a backup first if unsure.`)) {
          fn();
          refreshDataInfo();
          SM.renderTodayStrip();
        }
      });
    }
  });
})();
