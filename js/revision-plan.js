// Plan de révision automatique.
//
// Les séances sont de vraies tâches de la to-do (avec durée), marquées
//   rev: { examId, chapterId (null = annales), methodId, at (date choisie par le plan), fb }
// → le planificateur les place dans les temps de travail comme les autres tâches.
//
// regenerate() refait le plan à partir d'aujourd'hui :
//  - les séances faites restent (elles comptent comme passages) ;
//  - une séance que tu as déplacée toi-même (date ≠ at) reste où tu l'as mise ;
//  - les séances manquées ou futures non faites sont recalculées.
// Pour chaque chapitre : nombre de passages selon la maîtrise et la peur, méthodes dans
// l'ordre des étapes (choix pondéré par tes retours), dates espacées (J+1, J+3, J+7, J+14).
// Chaque jour, au plus `share` du temps de travail va aux révisions ; les chapitres faibles
// et les gros coefficients passent en premier.

import { getData, update } from './storage.js';
import { dateKey, addDays, uid } from './util.js';
import { normalize } from './todo-model.js';
import { schedule } from './scheduler.js';
import { daysUntil, examName } from './exams-model.js';

const span = (a, b) => daysUntil(b, a); // nombre de jours de a à b

export function methodsFor(exam) {
  return getData().revision.methods
    .filter(m => m.active && (!m.formats.length || m.formats.includes(exam.format)))
    .sort((a, b) => a.stage - b.stage);
}
const isExamLevel = m => m.id === 'annales' || m.stage >= 4;

// Passages voulus pour un chapitre.
export function passesNeeded(c, p) {
  const k = (0.35 + 0.65 * (5 - c.mastery) / 5) * (c.fear ? 1.25 : 1);
  return Math.max(1, Math.min(8, Math.round(p.passes * (p.calib || 1) * k)));
}

export function windowOf(exam, today = dateKey()) {
  const p = getData().revision.profile;
  const before = Math.ceil((p.startDays[exam.type] ?? 7) * (p.calib || 1));
  const from = addDays(exam.date, -before);
  return { from: from < today ? today : from, to: addDays(exam.date, -1) };
}

// Temps de travail du jour réservable aux révisions (minutes).
function budgets(from, to, share) {
  const { planning: p, tasks } = getData();
  const out = {};
  for (let k = from; k <= to; k = addDays(k, 1)) {
    const fixed = tasks.filter(t => t.date === k && t.start && t.end);
    out[k] = Math.floor(schedule(p, fixed, k).main * share);
  }
  return out;
}

export function regenerate() {
  const today = dateKey();
  const d0 = getData();
  const { profile: p } = d0.revision;
  const exams = d0.exams.filter(e => e.date > today && !e.planOff && e.chapters.length);
  const examIds = new Set(d0.exams.map(e => e.id));

  // 1. ce qu'on garde
  const keep = t => !t.rev || t.done || (t.date >= today && t.date !== t.rev.at && examIds.has(t.rev.examId));
  const kept = d0.tasks.filter(t => t.rev && keep(t));

  // 2. séances à placer
  const units = [];
  let last = today;
  for (const e of exams) {
    const w = windowOf(e, today);
    if (w.to < w.from) continue;
    if (w.to > last) last = w.to;
    const ms = methodsFor(e);
    const chMethods = ms.filter(m => !isExamLevel(m));
    const stages = [...new Set(chMethods.map(m => m.stage))];
    const days = span(w.from, w.to);
    const closeness = 1 + 7 / Math.max(1, daysUntil(e.date, today));
    const order = e.chapters.slice().sort((a, b) => (b.fear - a.fear) || (a.mastery - b.mastery));

    order.forEach((c, i) => {
      if (!stages.length) return;
      const mine = kept.filter(t => t.rev.examId === e.id && t.rev.chapterId === c.id).sort((a, b) => a.date.localeCompare(b.date));
      let k = mine.length;
      const need = passesNeeded(c, p);
      if (k >= need) return;
      const startIdx = c.mastery >= 4 ? stages.length - 1 : c.mastery >= 3 ? Math.min(1, stages.length - 1) : 0;
      const gap = j => p.spacing[Math.min(j, p.spacing.length - 1)];
      // date du prochain passage : après le dernier passage, ou étalée selon l'ordre de priorité
      let date = k ? addDays(mine[k - 1].date, gap(k - 1)) : addDays(w.from, Math.floor(i * days * 0.5 / order.length));
      if (date < w.from) date = w.from;
      // si les intervalles ne tiennent pas avant l'épreuve, on les resserre
      let total = 0;
      for (let j = k; j < need - 1; j++) total += gap(j);
      const room = span(date, w.to);
      const f = total > room ? room / total : 1;
      const used = {};
      mine.forEach(t => { used[t.rev.methodId] = (used[t.rev.methodId] || 0) + 1; });
      for (; k < need; k++) {
        const stage = stages[Math.min(startIdx + k, stages.length - 1)];
        const m = chMethods.filter(x => x.stage === stage)
          .sort((a, b) => b.weight / (1 + (used[b.id] || 0)) - a.weight / (1 + (used[a.id] || 0)))[0];
        used[m.id] = (used[m.id] || 0) + 1;
        units.push({
          exam: e, chapter: c, method: m, date: date > w.to ? w.to : date, from: w.from, to: w.to,
          score: e.coef * (1 + (5 - c.mastery) / 5) * (c.fear ? 1.5 : 1) * closeness,
        });
        date = addDays(date, Math.max(1, Math.round(gap(k) * f)));
      }
    });

    // annales : en fin de période, sur toute l'épreuve
    const ann = ms.find(isExamLevel);
    if (ann) {
      const doneAnn = kept.filter(t => t.rev.examId === e.id && !t.rev.chapterId).length;
      const n = Math.max(1, Math.round(p.passes * (p.calib || 1) / 2)) - doneAnn;
      for (let j = 0; j < n; j++) {
        const date = addDays(w.to, -2 * j);
        units.push({ exam: e, chapter: null, method: ann, date: date < w.from ? w.from : date, from: w.from, to: w.to, score: e.coef * 2 * closeness });
      }
    }
  }

  // 3. placement jour par jour, dans la limite du budget
  const budget = units.length ? budgets(today, last, p.share) : {};
  for (const t of kept) if (budget[t.date] !== undefined && !t.done) budget[t.date] -= t.duration || 0;
  units.sort((a, b) => a.date.localeCompare(b.date) || b.score - a.score);
  const over = {};
  const created = [];
  for (const u of units) {
    const minutes = Math.min(u.method.minutes, p.sessionMin);
    const tries = [];
    for (let k = u.date; k <= u.to; k = addDays(k, 1)) tries.push(k);
    for (let k = addDays(u.date, -1); k >= u.from; k = addDays(k, -1)) tries.push(k);
    let day = tries.find(k => budget[k] >= minutes);
    if (!day) { // rien ne rentre : le jour le moins chargé, et on le signale
      day = tries.reduce((a, b) => (budget[b] > budget[a] ? b : a), u.date);
      over[u.exam.id] = (over[u.exam.id] || 0) + minutes;
    }
    budget[day] -= minutes;
    const e = u.exam, c = u.chapter;
    const felt = e.felt || 3;
    created.push(normalize({
      id: uid(), date: day, duration: minutes, subject: e.subject, deadline: e.date,
      title: c ? `${c.name} · ${u.method.name}` : `${u.method.name} · ${examName(e)}`,
      priority: (c?.fear || daysUntil(e.date, day) <= 3) ? 2 : 1,
      difficulty: c?.fear || felt >= 4 ? 3 : felt <= 2 ? 1 : 2,
      rev: { examId: e.id, chapterId: c?.id || null, methodId: u.method.id, at: day, fb: null },
    }));
  }

  update(d => {
    d.tasks = d.tasks.filter(keep).concat(created);
    d.revision.lastPlan = today;
    for (const e of d.exams) e.planOver = over[e.id] || 0;
  });
}

// Une fois par jour (séances manquées d'hier → replanifiées).
export function dailyCheck() {
  if (getData().revision.lastPlan !== dateKey()) regenerate();
}

export function planStats(exam) {
  const list = getData().tasks.filter(t => t.rev?.examId === exam.id);
  const sum = l => l.reduce((n, t) => n + (t.duration || 0), 0);
  const done = list.filter(t => t.done);
  return { list, n: list.length, done: done.length, minutes: sum(list), doneMin: sum(done) };
}

/* ---------- Retours après une séance ---------- */

export const FEEDBACK = { efficace: 'Efficace', moyen: 'Moyen', inutile: 'Inutile' };

export function applyFeedback(taskId, fb, mastery) {
  const t = getData().tasks.find(x => x.id === taskId);
  if (!t?.rev) return;
  const real = getData().sessions.filter(s => s.taskId === taskId).reduce((n, s) => n + s.minutes, 0);
  update(d => {
    const x = d.tasks.find(y => y.id === taskId);
    x.rev.fb = fb;
    const m = d.revision.methods.find(y => y.id === t.rev.methodId);
    if (m) {
      m.weight = Math.max(0.3, Math.min(2, m.weight * { efficace: 1.15, moyen: 1, inutile: 0.8 }[fb]));
      // durée : on se rapproche du temps réellement passé (chrono)
      if (real >= 10) m.minutes = Math.max(15, Math.min(240, Math.round((m.minutes * 0.75 + real * 0.25) / 5) * 5));
    }
    const e = d.exams.find(y => y.id === t.rev.examId);
    const c = e?.chapters.find(y => y.id === t.rev.chapterId);
    if (c && mastery !== null && mastery !== c.mastery) {
      c.mastery = mastery;
      c.history = [...(c.history || []), { date: dateKey(), mastery }];
    }
  });
  regenerate();
}

/* ---------- Après l'épreuve : la note affine le profil ---------- */

// Compare la note à la préparation annoncée ; ajuste profile.calib (plus de temps / moins de temps).
export function calibrate(exam, readinessNow) {
  if (exam.grade === null || exam.calibDone) return null;
  const score = exam.grade / (exam.gradeMax || 20);
  const ratio = score / Math.max(0.2, readinessNow);
  const factor = ratio < 0.8 ? 1.15 : ratio > 1.2 ? 0.92 : 1;
  let note;
  update(d => {
    const p = d.revision.profile;
    p.calib = Math.max(0.7, Math.min(1.6, Math.round((p.calib || 1) * factor * 100) / 100));
    const x = d.exams.find(y => y.id === exam.id);
    x.calibDone = true;
    x.readyAtExam = readinessNow;
    note = factor > 1 ? `Note en dessous de ta préparation (${Math.round(readinessNow * 100)} %) : les prochains plans commenceront plus tôt avec plus de passages.`
      : factor < 1 ? `Note au-dessus de ta préparation (${Math.round(readinessNow * 100)} %) : les prochains plans seront un peu plus légers.`
      : `Note cohérente avec ta préparation (${Math.round(readinessNow * 100)} %) : le profil ne change pas.`;
    x.calibNote = note;
  });
  return note;
}
