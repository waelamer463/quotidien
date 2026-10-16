// Calculs de statistiques à partir des habitudes et des saisies.
// Aujourd'hui compte seulement s'il est déjà réussi (la journée n'est pas finie).

import { dateKey, addDays } from './util.js';
import { isScheduled, status } from './habits-model.js';

// 'done' | 'todo' | 'over' | 'pending' (aujourd'hui, pas encore réussi) | null (non prévu)
export function dayResult(h, entries, key, today = dateKey()) {
  if (key > today || !isScheduled(h, key)) return null;
  const st = status(h, entries[key]?.[h.id] ?? 0);
  if (key === today && st !== 'done') return 'pending';
  return st;
}

function firstDay(h) {
  return h.start || h.created;
}

export function currentStreak(h, entries, today = dateKey()) {
  let n = 0;
  for (let k = today; k >= firstDay(h); k = addDays(k, -1)) {
    const r = dayResult(h, entries, k, today);
    if (r === null || r === 'pending') continue;
    if (r !== 'done') break;
    n++;
  }
  return n;
}

export function bestStreak(h, entries, today = dateKey()) {
  let best = 0, run = 0;
  for (let k = firstDay(h); k <= today; k = addDays(k, 1)) {
    const r = dayResult(h, entries, k, today);
    if (r === null || r === 'pending') continue;
    run = r === 'done' ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

// Taux de réussite sur les `days` derniers jours, ou null si aucun jour prévu.
export function successRate(habits, entries, days, today = dateKey()) {
  let done = 0, total = 0;
  for (let i = 0; i < days; i++) {
    const k = addDays(today, -i);
    for (const h of habits) {
      const r = dayResult(h, entries, k, today);
      if (r === null || r === 'pending') continue;
      total++;
      if (r === 'done') done++;
    }
  }
  return total ? done / total : null;
}

// Part des objectifs atteints un jour donné, toutes habitudes confondues.
export function dayScore(habits, entries, key, today = dateKey()) {
  let done = 0, total = 0;
  for (const h of habits) {
    const r = dayResult(h, entries, key, today);
    if (r === null) continue;
    total++;
    if (r === 'done') done++;
  }
  return { done, total };
}
