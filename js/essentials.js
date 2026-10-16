// Les essentiels de chaque jour : 5 prières, calories, pas, salle (objectif par semaine).
//
// data.log["AAAA-MM-JJ"] = { prayers: { fajr: 'heure'|'rattrapee'|'manquee' }, kcal, pas, salle: true }
// data.essentials = { kcalMin, kcalMax, steps, gymPerWeek }

import { getData, update } from './storage.js';
import { addDays, parseKey } from './util.js';
import { PRAYERS } from './prayers.js';

export const PRAYER_STATES = {
  heure: 'à l\'heure',
  rattrapee: 'rattrapée',
  manquee: 'manquée',
};

export function dayLog(key) {
  return getData().log[key] || {};
}

export function setLog(key, fn) {
  update(d => {
    const cur = { ...d.log[key], prayers: { ...d.log[key]?.prayers } };
    fn(cur);
    d.log[key] = cur;
  });
}

// Touche une prière : vide → (à l'heure ou rattrapée selon le planning) → … → vide
export function cyclePrayer(key, name, plannedLate) {
  setLog(key, l => {
    const order = plannedLate ? ['rattrapee', 'heure', 'manquee'] : ['heure', 'rattrapee', 'manquee'];
    const cur = l.prayers[name];
    const next = cur ? order[order.indexOf(cur) + 1] : order[0];
    if (next) l.prayers[name] = next; else delete l.prayers[name];
  });
}

// Lundi de la semaine d'une date
export function weekStart(key) {
  return addDays(key, -((parseKey(key).getDay() + 6) % 7));
}

export function gymWeek(key) {
  const start = weekStart(key);
  const days = [];
  for (let i = 0; i < 7; i++) {
    const k = addDays(start, i);
    days.push({ key: k, done: Boolean(getData().log[k]?.salle) });
  }
  return { days, count: days.filter(d => d.done).length };
}

export function kcalState(v, e) {
  if (!v) return 'todo';
  return v > e.kcalMax ? 'over' : v >= e.kcalMin ? 'done' : 'todo';
}

// Part des essentiels réussis un jour donné (0 à 1). La salle compte si l'objectif de la semaine
// est atteint ou si elle a été faite ce jour-là.
export function essentialsScore(key) {
  const e = getData().essentials;
  const l = dayLog(key);
  const prayers = PRAYERS.reduce((n, p) => n + (l.prayers?.[p] === 'heure' ? 1 : l.prayers?.[p] === 'rattrapee' ? 0.6 : 0), 0) / 5;
  const kcal = kcalState(l.kcal, e) === 'done' ? 1 : 0;
  const pas = Math.min(1, (l.pas || 0) / e.steps);
  const gym = l.salle || gymWeek(key).count >= e.gymPerWeek ? 1 : 0;
  return (prayers * 2 + kcal + pas + gym) / 5; // les prières pèsent double
}
