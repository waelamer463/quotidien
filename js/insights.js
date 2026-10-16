// Calculs des stats : score du jour, essentiels, to-do, répartition de la journée.

import { getData } from './storage.js';
import { dateKey, addDays } from './util.js';
import { PRAYERS } from './prayers.js';
import { buildDay } from './planning-model.js';
import { essentialsScore, kcalState, gymWeek, weekStart } from './essentials.js';

export const WEIGHT_ESS = 0.6; // essentiels 60 %, to-do 40 %

function hasData(key) {
  const { log, tasks } = getData();
  const l = log[key];
  return Boolean(l && (l.kcal || l.pas || l.salle || Object.keys(l.prayers || {}).length)) || tasks.some(t => t.date === key);
}

export function todoRate(key) {
  const list = getData().tasks.filter(t => t.date === key);
  return list.length ? list.filter(t => t.done).length / list.length : null;
}

// Score sur 100, ou null si rien n'a été saisi ce jour-là.
export function dayScore(key) {
  if (!hasData(key)) return null;
  const ess = essentialsScore(key);
  const todo = todoRate(key);
  return Math.round(100 * (todo === null ? ess : WEIGHT_ESS * ess + (1 - WEIGHT_ESS) * todo));
}

export function scoreSeries(days = 30, today = dateKey()) {
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const k = addDays(today, -i);
    out.push({ key: k, score: dayScore(k) });
  }
  return out;
}

// Position du jour par rapport aux jours précédents.
export function standing(series) {
  const today = series.at(-1);
  const past = series.slice(0, -1).map(d => d.score).filter(s => s !== null);
  if (today.score === null || !past.length) return null;
  const avg = past.reduce((a, b) => a + b, 0) / past.length;
  const below = past.filter(s => s < today.score).length;
  return { avg: Math.round(avg), pct: Math.round((below / past.length) * 100), delta: Math.round(today.score - avg), n: past.length };
}

/* ---------- Essentiels ---------- */

export function essentialsStats(days = 30, today = dateKey()) {
  const { log, essentials: e } = getData();
  const perPrayer = Object.fromEntries(PRAYERS.map(p => [p, { heure: 0, rattrapee: 0, manquee: 0 }]));
  let kcalDays = 0, kcalOk = 0, pasDays = 0, pasSum = 0, pasOk = 0;
  for (let i = 0; i < days; i++) {
    const l = log[addDays(today, -i)];
    if (!l) continue;
    for (const p of PRAYERS) if (l.prayers?.[p]) perPrayer[p][l.prayers[p]]++;
    if (l.kcal) { kcalDays++; if (kcalState(l.kcal, e) === 'done') kcalOk++; }
    if (l.pas) { pasDays++; pasSum += l.pas; if (l.pas >= e.steps) pasOk++; }
  }
  const totals = Object.values(perPrayer).reduce((t, x) => ({
    heure: t.heure + x.heure, rattrapee: t.rattrapee + x.rattrapee, manquee: t.manquee + x.manquee,
  }), { heure: 0, rattrapee: 0, manquee: 0 });
  const logged = totals.heure + totals.rattrapee + totals.manquee;
  const worst = PRAYERS.map(p => [p, perPrayer[p].rattrapee + perPrayer[p].manquee]).sort((a, b) => b[1] - a[1])[0];

  // salle : semaines récentes (la semaine en cours comprise)
  const weeks = [];
  for (let w = 3; w >= 0; w--) {
    const k = addDays(weekStart(today), -7 * w);
    weeks.push({ key: k, count: gymWeek(k).count });
  }
  return {
    perPrayer, totals, logged, worst: worst[1] ? worst[0] : null,
    kcalDays, kcalOk, pasDays, pasAvg: pasDays ? Math.round(pasSum / pasDays) : 0, pasOk,
    weeks, gymGoal: e.gymPerWeek,
  };
}

/* ---------- To-do ---------- */

export function todoStats(days = 30, today = dateKey()) {
  const from = addDays(today, -(days - 1));
  const { tasks } = getData();
  const inRange = tasks.filter(t => t.date >= from && t.date <= today);
  const done = inRange.filter(t => t.done);
  const doneMin = done.reduce((n, t) => n + (t.duration || 0), 0);
  const postponed = tasks.filter(t => t.postponed > 0 && (t.date >= from)).length;
  const late = tasks.filter(t => !t.done && t.date < today).length;
  const urgent = inRange.filter(t => t.priority === 3);
  return {
    planned: inRange.length, done: done.length, doneMin, postponed, late,
    urgentRate: urgent.length ? urgent.filter(t => t.done).length / urgent.length : null,
  };
}

/* ---------- Répartition de la journée ---------- */

// Catégories dans l'ordre fixe des couleurs.
export const SHARE = [
  ['cours', 'Cours'], ['travail', 'Travail'], ['priere', 'Prières'],
  ['repas', 'Repas'], ['trajet', 'Trajets'], ['perso', 'Routine / perso'],
];
const bucket = it => (it.kind === 'tache' ? 'travail' : it.kind === 'routine' ? 'perso' : it.kind);

export function dayShare(key) {
  const p = getData().planning;
  const items = buildDay(p, key).items.filter(i => !i.prayer && i.end > i.start);
  const out = Object.fromEntries(SHARE.map(([k]) => [k, 0]));
  for (const it of items) {
    const b = bucket(it);
    if (b in out) out[b] += it.end - it.start;
  }
  return out;
}

export function averageShare(days = 30, today = dateKey()) {
  const sum = Object.fromEntries(SHARE.map(([k]) => [k, 0]));
  for (let i = 1; i <= days; i++) {
    const s = dayShare(addDays(today, -i));
    for (const k in sum) sum[k] += s[k];
  }
  for (const k in sum) sum[k] = Math.round(sum[k] / days);
  return sum;
}
