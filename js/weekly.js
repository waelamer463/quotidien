// Bilan de la semaine (lundi → dimanche) et objectif de la semaine suivante.
//
// data.weekly["<lundi>"] = { text, kind, value, set: date }  → objectif de la semaine qui commence ce lundi
//   kind : 'travail' (heures) | 'salle' (séances) | 'prieres' (% à l'heure) | 'pas' (moyenne) | 'revision' (séances) | 'libre'

import { getData, update } from './storage.js';
import { dateKey, addDays, parseKey } from './util.js';
import { weekStart, workGoal, sleepMinutes, kcalState } from './essentials.js';
import { minutesOn, minutesBySubject } from './chrono.js';
import { dayScore } from './insights.js';
import { upcoming, readiness } from './exams-model.js';

export const GOAL_KINDS = {
  travail: { label: 'Heures de travail', unit: 'h', step: 1 },
  salle: { label: 'Séances de salle', unit: 'séances', step: 1 },
  prieres: { label: 'Prières à l\'heure', unit: '%', step: 5 },
  pas: { label: 'Pas par jour (moyenne)', unit: 'pas', step: 500 },
  revision: { label: 'Séances de révision faites', unit: 'séances', step: 1 },
  libre: { label: 'Objectif libre (sans chiffre)', unit: '', step: 1 },
};

const days = mon => Array.from({ length: 7 }, (_, i) => addDays(mon, i));
const avg = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

// Semaine à résumer : dimanche → la semaine en cours ; sinon la précédente.
export function reviewWeek(today = dateKey()) {
  const mon = weekStart(today);
  return parseKey(today).getDay() === 0 ? mon : addDays(mon, -7);
}

// Mesures d'une semaine (jusqu'à aujourd'hui au plus).
export function measure(mon, today = dateKey()) {
  const { log, tasks, essentials: e } = getData();
  const ks = days(mon).filter(k => k <= today);
  const ls = ks.map(k => log[k] || {});
  const pr = ls.flatMap(l => Object.values(l.prayers || {}));
  const pas = ls.map(l => l.pas).filter(Boolean);
  const inWeek = t => t.date >= mon && t.date <= addDays(mon, 6);
  const dur = tasks.filter(t => inWeek(t) && t.duration);
  const rev = tasks.filter(t => inWeek(t) && t.rev);
  return {
    days: ks.length,
    work: ks.reduce((n, k) => n + minutesOn(k), 0),
    workGoal: ks.reduce((n, k) => n + workGoal(k), 0),
    bySubject: minutesBySubject(mon, addDays(mon, 6)),
    prayersOk: pr.filter(v => v === 'heure').length, prayersLate: pr.filter(v => v === 'rattrapee').length, prayersN: pr.length,
    kcalOk: ls.filter(l => kcalState(l.kcal, e) === 'done').length,
    pas: avg(pas), pasOk: pas.filter(v => v >= e.steps).length,
    salle: ls.filter(l => l.salle).length,
    sleep: avg(ls.map(sleepMinutes).filter(v => v !== null)),
    score: avg(ks.map(dayScore).filter(v => v !== null)),
    plannedMin: dur.reduce((n, t) => n + t.duration, 0),
    doneMin: dur.filter(t => t.done).reduce((n, t) => n + t.duration, 0),
    tasksN: tasks.filter(inWeek).length, tasksDone: tasks.filter(t => inWeek(t) && t.done).length,
    revN: rev.length, revDone: rev.filter(t => t.done).length,
  };
}

// Progression d'un objectif (valeur actuelle, ratio 0–1).
export function goalProgress(goal, mon, today = dateKey()) {
  if (!goal || goal.kind === 'libre' || !goal.value) return null;
  const m = measure(mon, today);
  const cur = {
    travail: m.work / 60,
    salle: m.salle,
    prieres: m.prayersN ? Math.round(m.prayersOk / m.prayersN * 100) : 0,
    pas: Math.round(m.pas || 0),
    revision: m.revDone,
  }[goal.kind];
  return { cur, ratio: Math.min(1, cur / goal.value) };
}

// Objectif proposé : le point le plus faible de la semaine.
export function suggestGoal(m) {
  const e = getData().essentials;
  const r = [];
  if (m.workGoal && m.work < m.workGoal * 0.85) r.push({ gap: 1 - m.work / m.workGoal, kind: 'travail', value: Math.round(m.workGoal / 60), text: 'Tenir mes heures de travail' });
  if (m.salle < e.gymPerWeek) r.push({ gap: 1 - m.salle / e.gymPerWeek, kind: 'salle', value: e.gymPerWeek, text: `Aller ${e.gymPerWeek} fois à la salle` });
  if (m.prayersN && m.prayersOk / m.prayersN < 0.9) r.push({ gap: 1 - m.prayersOk / m.prayersN, kind: 'prieres', value: 90, text: 'Prier à l\'heure' });
  if (m.pas !== null && m.pas < e.steps) r.push({ gap: 1 - m.pas / e.steps, kind: 'pas', value: e.steps, text: `Marcher ${e.steps.toLocaleString('fr-FR')} pas par jour` });
  if (m.revN && m.revDone / m.revN < 0.8) r.push({ gap: 1 - m.revDone / m.revN, kind: 'revision', value: m.revN, text: 'Faire toutes mes séances de révision' });
  return r.sort((a, b) => b.gap - a.gap)[0] || { kind: 'travail', value: Math.round((m.workGoal || 1200) / 60), text: 'Garder le rythme' };
}

export function examsSnapshot() {
  return upcoming().slice(0, 3).map(x => ({ exam: x, r: readiness(x) }));
}

export function setGoal(mon, goal) {
  update(d => { (d.weekly ??= {})[mon] = { ...goal, set: dateKey() }; });
}

export const goalOf = mon => getData().weekly?.[mon] || null;
