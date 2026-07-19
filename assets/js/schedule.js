/* Schedule: a recommended hour-by-hour plan for each shift type — meals, gym
 * window, walk breaks toward 10k steps, sleep, caffeine and light management.
 * Auto-selects today's shift, adapts to the position in the block (first /
 * mid / last night, off-day after nights) and to today's recovery colour.
 * Times assume nights 19:00–07:00 and days 07:00–19:00 (from the rota). */
(function () {
  const byId = (id) => document.getElementById(id);

  const CATS = {
    sleep: { color: 'var(--m-sleep)', icon: 'bed', label: 'Sleep' },
    meal: { color: 'var(--m-carbs)', icon: 'utensils', label: 'Food' },
    gym: { color: 'var(--m-strain)', icon: 'flame', label: 'Training' },
    steps: { color: 'var(--m-recovery)', icon: 'activity', label: 'Steps' },
    shift: { color: 'var(--brand)', icon: 'clock', label: 'Shift' },
    care: { color: 'var(--m-vitals)', icon: 'droplet', label: 'Body clock & care' },
  };

  /* Each item: [time-label, minutes-from-05:00 (can exceed 24h), cat, title, body] */
  function gymItem(t, m, redRecovery, body) {
    return redRecovery
      ? [t, m, 'gym', 'Recovery slot (red day)', 'Recovery is red — swap the session for 20 min of easy mobility and stretching. Keep every walk; skip the weights until you\'re yellow or green.']
      : [t, m, 'gym', 'Gym window', body];
  }

  function nightItems(variant, red) {
    if (variant === 'first') {
      return [
        ['—', 0, 'sleep', 'Lie in as late as you can', 'No alarm this morning — every extra hour banked now is an hour of tonight\'s shift you\'ll feel human for.'],
        ['12:30', 450, 'meal', 'Breakfast/lunch', 'First meal, unhurried. Normal food — the shifted eating pattern starts tonight, not now.'],
        ['14:00', 540, 'sleep', 'Pre-shift nap, 90–120 min', 'The single highest-value item today. Dark room, phone on do-not-disturb, alarm for 16:00.'],
        ['16:15', 675, 'care', 'Wake, daylight, hydrate', 'Get outside light for 10 minutes to feel alert, and start the shift well-hydrated.'],
        gymItem('16:30', 690, red, 'Trained-and-fed before the block starts beats anything mid-block. Main lifts today; keep something in the tank for the shift.'),
        ['17:45', 765, 'meal', 'Pre-shift meal', 'The day\'s main meal: protein + slow carbs. You\'re fuelling 12 hours.'],
        ['18:30', 810, 'steps', 'Walk part of the commute', '~15 min brisk ≈ 1,700 steps. Chunk 1 of the 10k.'],
        ['19:00', 840, 'shift', 'Shift starts', 'First caffeine now if you want it — it\'s a long way to 07:00.'],
        ['21:30', 990, 'steps', 'Walk break 1', '15 min ≈ 1,700 steps. Early break while the ward is still lively.'],
        ['00:00', 1140, 'meal', 'Midnight meal + caffeine cut-off', 'Light and protein-forward — heavy food now deepens the 3–4am dip. LAST caffeine of the night; later than this and it eats your morning sleep.'],
        ['01:30', 1230, 'steps', 'Walk break 2', '15 min ≈ 1,700 steps. Movement beats sugar for the dip that\'s coming.'],
        ['03:30', 1350, 'steps', 'Walk break 3 + bright light', '10–15 min ≈ 1,500 steps in the brightest area you can find. This is the circadian low — walk through it.'],
        ['05:30', 1470, 'meal', 'Small snack if needed', 'Something light only. Ease off fluids so your morning sleep isn\'t broken by the bathroom.'],
        ['07:00', 1560, 'shift', 'Shift ends — sunglasses on', 'Seriously: morning light on the commute tells your body clock it\'s daytime. Block it and sleep comes easier.'],
        ['07:45', 1605, 'meal', 'Small post-shift bite', 'Optional and small — enough to not wake up hungry, not a meal.'],
        ['08:15', 1635, 'sleep', 'Day sleep', 'Blackout, earplugs/white noise, phone on do-not-disturb, household warned. One continuous block — this is tomorrow\'s recovery score.'],
      ];
    }
    if (variant === 'last') {
      return [
        ['15:00', 600, 'care', 'Wake from day sleep', 'Last full day-sleep of the block. Daylight and water on waking.'],
        ['15:45', 645, 'meal', 'First meal', 'Protein-forward. Normal-ish portions — tomorrow you flip back to daytime.'],
        gymItem('16:30', 690, red, 'Light-to-moderate only on the last night — the flip-back costs recovery too. Save the big session for rest-day 2.'),
        ['17:45', 765, 'meal', 'Pre-shift meal', 'Main meal before the final push.'],
        ['18:30', 810, 'steps', 'Walk part of the commute', '~15 min ≈ 1,700 steps.'],
        ['19:00', 840, 'shift', 'Final night begins', 'Caffeine early in the shift only — you want to be able to nap briefly after it, then be tired tonight.'],
        ['21:30', 990, 'steps', 'Walk break 1', '15 min ≈ 1,700 steps.'],
        ['00:00', 1140, 'meal', 'Midnight meal + hard caffeine stop', 'Lighter than usual — you\'re sleeping SHORT after this shift, not a full day.'],
        ['01:30', 1230, 'steps', 'Walk break 2', '15 min ≈ 1,700 steps.'],
        ['03:30', 1350, 'steps', 'Walk break 3 + bright light', '10–15 min. Last dip of the block — you know the drill.'],
        ['07:00', 1560, 'shift', 'Block done — sunglasses home', 'The flip-back starts now.'],
        ['08:00', 1620, 'sleep', 'SHORT sleep only: 90 min–3 h', 'Alarm set, non-negotiable. A full day-sleep today steals tonight\'s sleep and wrecks the reset.'],
        ['11:30', 1830, 'care', 'Up, shower, daylight', 'Get outside — afternoon light drags your clock back to daytime.'],
        ['13:00', 1920, 'meal', 'Lunch at a normal time', 'Back to daytime meal timing immediately.'],
        ['15:00', 2040, 'steps', 'Long easy walk', '30–40 min ≈ 4,000 steps in daylight. Finishes the flip and tops up the step count.'],
        ['18:30', 2250, 'meal', 'Dinner', 'Normal evening meal. No alcohol tonight — it fragments exactly the sleep you\'re trying to rebuild.'],
        ['21:30', 2430, 'sleep', 'Early night', 'You\'ll be tired. Let it happen — a long normal night tonight completes the reset.'],
      ];
    }
    // mid-block night (the standard rhythm)
    return [
      ['15:00', 600, 'care', 'Wake, daylight, hydrate', 'End of the day-sleep block. Light and a big glass of water before anything else.'],
      ['15:30', 630, 'meal', '“Breakfast”', 'First meal of your day: protein-forward, easy to digest.'],
      gymItem('16:15', 675, red, 'The best mid-block slot: fed, rested, and done before the shift. 45–60 min; leave enough for 12 hours on your feet.'),
      ['17:45', 765, 'meal', 'Pre-shift meal', 'Main meal of the day: protein + slow carbs + veg. Eating big here means the midnight meal can stay light.'],
      ['18:30', 810, 'steps', 'Walk part of the commute', '~15 min brisk ≈ 1,700 steps. If you drive, park further away — it\'s the cheapest chunk of the 10k.'],
      ['19:00', 840, 'shift', 'Shift starts', 'Caffeine fine for the first half of the shift.'],
      ['21:30', 990, 'steps', 'Walk break 1', '15 min ≈ 1,700 steps.'],
      ['00:00', 1140, 'meal', 'Midnight meal + caffeine cut-off', 'Light, protein-forward. This is the last caffeine — anything later shreds your 8am sleep.'],
      ['01:30', 1230, 'steps', 'Walk break 2', '15 min ≈ 1,700 steps. Movement is the anti-dip tool, not vending-machine sugar.'],
      ['03:30', 1350, 'steps', 'Walk break 3 + bright light', '10–15 min ≈ 1,500 steps somewhere bright. The 3–4am low passes faster on your feet.'],
      ['05:30', 1470, 'meal', 'Small snack if needed', 'Optional. Start tapering fluids for unbroken morning sleep.'],
      ['07:00', 1560, 'shift', 'Shift ends — sunglasses on', 'Block the morning light on the way home; it\'s the difference between falling asleep at 8 and staring at the ceiling.'],
      ['07:45', 1605, 'meal', 'Small post-shift bite', 'Light — cereal-sized, not dinner-sized.'],
      ['08:15', 1635, 'sleep', 'Day sleep, one block', 'Blackout + earplugs + do-not-disturb. Aim to stay down until ~15:00.'],
    ];
  }

  function dayItems(red) {
    return [
      ['05:45', 45, 'care', 'Wake, water, light', 'Curtains open or lights full on — starting bright makes the 05:45 alarm civilised.'],
      ['06:00', 60, 'meal', 'Breakfast', 'Protein + slow carbs; you\'re eating for a 12-hour shift. Coffee 1 of max 2.'],
      ['06:30', 90, 'steps', 'Walk part of the commute', '~15 min ≈ 1,700 steps before the day owns you.'],
      ['07:00', 120, 'shift', 'Shift starts', ''],
      ['10:00', 300, 'steps', 'Walk break 1', '10–15 min ≈ 1,500 steps. Last sensible coffee of the day around now — caffeine after noon taxes tonight\'s sleep.'],
      ['12:30', 450, 'meal', 'Lunch', 'Prepped box (Batch cook makes this trivial). Eat away from the work area if you can.'],
      ['15:00', 600, 'steps', 'Walk break 2', '10–15 min ≈ 1,500 steps. The afternoon slump responds to legs, not snacks.'],
      ['17:30', 750, 'meal', 'Small snack', 'A little fuel so you\'re not ravenous at the gym or dinner.'],
      ['19:00', 840, 'shift', 'Shift ends', ''],
      gymItem('19:20', 860, red, '40–50 min, straight from work before home gravity wins. Ward shifts already cost steps and strain — match the session to your recovery colour.'),
      ['20:30', 930, 'meal', 'Post-shift dinner', 'The recovery meal: protein + carbs. Prepped beats cooking at 8:30pm every time.'],
      ['21:15', 975, 'care', 'Wind down', 'Screens dim or off, tomorrow\'s bag packed, big light off.'],
      ['21:45', 1005, 'sleep', 'Lights out', 'That\'s 8 h before the 05:45 alarm. Four days of this only works if this one is protected.'],
    ];
  }

  function offItems(ctx, red) {
    if (ctx.afterNights) return null; // flip-back day is covered by the "last night" plan
    const items = [
      ['08:00', 180, 'care', 'Wake at a normal time', 'Rest days repair your baseline only if sleep timing stays put. No noon lie-ins mid-rota.'],
      ['08:30', 210, 'meal', 'Breakfast', 'Normal daytime eating all day today.'],
      gymItem('10:30', 330, red, 'THE training slot of the rota: rested, fed, no shift after. This is where the hard sessions live.'),
      ['12:30', 450, 'meal', 'Lunch', ''],
      ['14:30', 570, 'steps', 'Daylight walk', '45–60 min ≈ 5,500 steps. Off days need deliberate steps — no ward to rack them up for you.'],
      ['17:00', 720, 'meal', 'Batch cook window', 'Cook for the next block while you have the energy — the Batch cook page does the portion maths.'],
      ['18:30', 810, 'meal', 'Dinner', ''],
    ];
    if (ctx.beforeNights) {
      items.push(
        ['22:00', 1020, 'care', 'Stay up late tonight', 'First night tomorrow — push bedtime to ~01:00 and lie in, so tomorrow\'s nap-plus-shift pattern lands softly.'],
        ['01:00', 1200, 'sleep', 'Late lights out', 'This is the one night a late bedtime is the disciplined choice.']
      );
    } else if (ctx.beforeDays) {
      items.push(
        ['21:15', 975, 'care', 'Wind down early', 'Up before 06:00 tomorrow. Bag packed, screens off.'],
        ['21:45', 1005, 'sleep', 'Lights out', '8 hours before the day-block alarm.']
      );
    } else {
      items.push(
        ['21:00', 960, 'care', 'Easy evening', 'Keep the sleep window steady even with no shift tomorrow.'],
        ['22:30', 1050, 'sleep', 'Lights out', 'Normal night — this is what your baseline recovers on.']
      );
    }
    return items;
  }

  /* ---------- rendering ---------- */
  function latestRecovery() {
    const data = getWhoopData();
    const keys = Object.keys(data).sort();
    for (let i = keys.length - 1; i >= 0; i--) {
      if (data[keys[i]].recovery !== undefined) return data[keys[i]].recovery;
    }
    return null;
  }

  const activeTab = () => Store.get('schedTab', null);

  function currentContext() {
    const now = new Date();
    const today = shiftFor(now);
    const yesterday = shiftFor(addDays(now, -1));
    const tomorrow = shiftFor(addDays(now, 1));
    return { today, yesterday, tomorrow };
  }

  function render() {
    const { today, yesterday, tomorrow } = currentContext();
    const rec = latestRecovery();
    const red = rec !== null && rec < 34;
    const tab = activeTab() || (today.code === 'N' ? 'night' : today.code === 'D' ? 'day' : (yesterday.code === 'N' ? 'night' : 'off'));

    // tab bar
    const tabs = [
      ['night', 'moon', 'Night shift'],
      ['day', 'sun', 'Day shift'],
      ['off', 'calendar', 'Off day'],
    ];
    const bar = byId('sched-tabs');
    bar.innerHTML = '';
    for (const [key, icon, label] of tabs) {
      const btn = document.createElement('button');
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', key === tab ? 'true' : 'false');
      btn.style.setProperty('--tab-accent', key === 'night' ? 'var(--shift-night)' : key === 'day' ? 'var(--shift-day)' : 'var(--muted)');
      btn.innerHTML = `${SM.icon(icon)}${label}`;
      btn.addEventListener('click', () => { Store.set('schedTab', key); render(); });
      bar.appendChild(btn);
    }

    // pick the variant + banner text
    let items, bannerBits = [];
    const isToday =
      (tab === 'night' && today.code === 'N') ||
      (tab === 'day' && today.code === 'D') ||
      (tab === 'off' && today.code === 'O');

    if (tab === 'night') {
      const variant = today.code === 'N' ? (today.run === 1 ? 'first' : today.run === today.runLength ? 'last' : 'mid') : 'mid';
      items = nightItems(variant, red);
      if (today.code === 'N') bannerBits.push(`Tonight is night ${today.run} of ${today.runLength}${variant === 'first' ? ' — the first-night plan below front-loads a nap' : variant === 'last' ? ' — the last-night plan includes the flip back to daytime' : ''}.`);
      else bannerBits.push('Showing the standard mid-block night plan.');
    } else if (tab === 'day') {
      items = dayItems(red);
      if (today.code === 'D') bannerBits.push(`Today is day shift ${today.run} of ${today.runLength}.`);
    } else {
      if (today.code === 'O' && yesterday.code === 'N') {
        items = nightItems('last', red).slice(11); // the morning-after part of the flip-back
        bannerBits.push('First rest day after nights — this is the back half of the flip-back plan: short morning sleep, daylight, early night.');
      } else {
        items = offItems({ beforeNights: tomorrow.code === 'N', beforeDays: tomorrow.code === 'D' }, red);
        if (tomorrow.code === 'N') bannerBits.push('Nights start tomorrow, so tonight runs late on purpose.');
        else if (tomorrow.code === 'D') bannerBits.push('Day shifts start tomorrow, so tonight ends early.');
      }
    }
    if (red) bannerBits.push(`Recovery is red (${rec}%) — the gym slot has been swapped for mobility; walks stay.`);
    else if (rec !== null) bannerBits.push(`Recovery ${rec}% — the gym slot stands.`);

    byId('sched-banner').innerHTML = bannerBits.length
      ? SM.banner(red ? 'warn' : 'good', red ? 'alert' : 'check', isToday ? 'Tuned to today' : 'Reference plan', bannerBits.join(' '))
      : '';

    // timeline with a "next up" marker when viewing today's own plan
    const wrap = byId('timeline');
    wrap.innerHTML = '';
    const now = new Date();
    const nowM = ((now.getHours() * 60 + now.getMinutes()) - 300 + 1440) % 1440; // minutes since 05:00
    let nextIdx = -1;
    if (isToday) {
      nextIdx = items.findIndex(([, m]) => (m % 1440) >= nowM);
    }
    items.forEach(([t, m, cat, title, body], i) => {
      const c = CATS[cat];
      const div = document.createElement('div');
      div.className = 'tl-item' + (i === nextIdx ? ' now' : '');
      div.innerHTML =
        `<div class="tl-time">${t}</div>` +
        `<div class="tl-dot" style="--dot:${c.color}">${SM.icon(c.icon)}</div>` +
        `<div class="tl-body"><h4>${title}${i === nextIdx ? ' <span class="tl-next">next up</span>' : ''}</h4>${body ? `<p>${body}</p>` : ''}</div>`;
      wrap.appendChild(div);
    });

    // legend
    byId('sched-legend').innerHTML = Object.values(CATS)
      .map((c) => `<span class="key"><span class="swatch" style="background:${c.color}"></span>${c.label}</span>`)
      .join('');
  }

  document.addEventListener('DOMContentLoaded', () => {
    render();
    loadRepoWhoopData().then((u) => { if (u) { render(); SM.renderTodayStrip(); } });
  });
})();
