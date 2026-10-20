// Répartition des tâches d'une journée dans les blocs de travail.
//
// 1. Les blocs "travail" du jour sont découpés en sessions (≤ focus.session minutes),
//    séparées par des pauses (au plus focus.maxPauses dans la journée).
// 2. Les tâches avec durée (sans horaire) sont triées : échéance aujourd'hui ou demain
//    d'abord, puis la priorité, puis l'échéance la plus proche.
//    Les blocs horaires de la to-do occupent leur créneau : on ne place rien dessus.
// 3. On remplit les sessions dans l'ordre chronologique (les blocs "si retard" en dernier).

import { addDays, dateKey } from './util.js';
import { buildDay } from './planning-model.js';

const MIN_CHUNK = 15; // on ne crée pas de morceau de tâche plus court

export function sortTasks(tasks, key) {
  const soon = addDays(key, 1);
  const urgent = t => (t.deadline && t.deadline <= soon ? 0 : 1);
  return [...tasks].sort((a, b) =>
    urgent(a) - urgent(b) ||
    (urgent(a) === 0 ? a.deadline.localeCompare(b.deadline) : 0) ||
    b.priority - a.priority ||
    (b.difficulty || 2) - (a.difficulty || 2) || // le plus difficile d'abord, quand on est frais
    (a.deadline || '9999').localeCompare(b.deadline || '9999') ||
    a.created.localeCompare(b.created));
}

function sessions(blocks, focus) {
  let pausesLeft = focus.maxPauses;
  const out = [];
  for (const b of blocks) {
    const L = b.end - b.start;
    let n = Math.max(1, Math.ceil(L / focus.session));
    const pauses = Math.min(n - 1, pausesLeft);
    n = pauses + 1;
    pausesLeft -= pauses;
    const len = (L - pauses * focus.pause) / n;
    let t = b.start;
    for (let i = 0; i < n; i++) {
      out.push({ block: b.eid, optional: b.optional, start: Math.round(t), end: Math.round(t + len) });
      t += len;
      if (i < n - 1) {
        out.push({ block: b.eid, pause: true, start: Math.round(t), end: Math.round(t + focus.pause) });
        t += focus.pause;
      }
    }
  }
  return out;
}

export function schedule(p, tasks, key, day = buildDay(p, key)) {
  const toMin = s => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
  const fixed = tasks.filter(t => t.date === key && t.start && t.end).map(t => [toMin(t.start), toMin(t.end)]);
  // blocs de travail, découpés autour des blocs horaires de la to-do
  const blocks = day.items.filter(i => i.kind === 'travail' && i.eid != null && i.end > i.start)
    .flatMap(b => fixed.reduce((parts, [fs, fe]) => parts.flatMap(x => (fe <= x.start || fs >= x.end ? [x] :
      [{ ...x, end: fs }, { ...x, start: fe }].filter(y => y.end - y.start >= MIN_CHUNK))), [b]));
  // aujourd'hui : on ne place rien dans le passé
  const now = new Date();
  const cut = key === dateKey(now) ? Math.ceil((now.getHours() * 60 + now.getMinutes()) / 5) * 5 : 0;
  const future = blocks.map(b => ({ ...b, start: Math.max(b.start, cut) })).filter(b => b.end - b.start >= MIN_CHUNK);
  const all = sessions(future, p.focus);
  const work = [...all.filter(s => !s.pause && !s.optional), ...all.filter(s => !s.pause && s.optional)];

  const placeable = tasks.filter(t => t.date === key && !t.done && t.duration && !t.start);
  const queue = sortTasks(placeable, key)
    .map(t => ({ task: t, left: t.duration }));
  const segments = all.filter(s => s.pause).map(s => ({ ...s, kind: 'pause' }));
  const usedOptional = new Set();

  for (const s of work) {
    let t = s.start;
    while (queue.length && s.end - t >= Math.min(MIN_CHUNK, queue[0].left)) {
      const q = queue[0];
      const len = Math.min(q.left, s.end - t);
      segments.push({ block: s.block, kind: 'task', start: t, end: t + len, task: q.task, part: q.left !== q.task.duration || len < q.left });
      if (s.optional) usedOptional.add(s.block);
      t += len;
      q.left -= len;
      if (q.left <= 0) queue.shift();
    }
    if (s.end - t >= MIN_CHUNK && !s.optional) {
      segments.push({ block: s.block, kind: 'free', start: t, end: s.end });
    }
  }

  segments.sort((a, b) => a.start - b.start);
  const capacity = work.reduce((n, s) => n + s.end - s.start, 0);
  const load = placeable.reduce((n, t) => n + t.duration, 0);
  return {
    segments,
    overflow: queue.map(q => ({ task: q.task, left: q.left })),
    capacity,
    load,
    usedOptional,
  };
}

// Premier jour suivant qui a du temps de travail (pour reporter des tâches).
export function nextWorkDay(p, key) {
  for (let i = 1; i <= 14; i++) {
    const k = addDays(key, i);
    if (buildDay(p, k).items.some(it => it.kind === 'travail' && it.end > it.start)) return k;
  }
  return addDays(key, 1);
}
