// Répartition des tâches d'une journée dans les blocs de travail.
//
// 1. Les blocs "travail" du jour sont découpés en sessions (≤ focus.session minutes),
//    séparées par des pauses (au plus focus.maxPauses dans la journée).
// 2. Les tâches sont triées : échéance aujourd'hui ou demain d'abord, puis les plus
//    difficiles, puis l'échéance la plus proche.
// 3. On remplit les sessions dans l'ordre chronologique (les blocs "si retard" en dernier).

import { addDays } from './util.js';
import { buildDay } from './planning-model.js';

export const DIFFICULTY = { 3: 'Difficile', 2: 'Moyenne', 1: 'Facile' };
const MIN_CHUNK = 15; // on ne crée pas de morceau de tâche plus court

export function sortTasks(tasks, key) {
  const soon = addDays(key, 1);
  const urgent = t => (t.deadline && t.deadline <= soon ? 0 : 1);
  return [...tasks].sort((a, b) =>
    urgent(a) - urgent(b) ||
    (urgent(a) === 0 ? a.deadline.localeCompare(b.deadline) : 0) ||
    b.difficulty - a.difficulty ||
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
  const blocks = day.items.filter(i => i.kind === 'travail' && i.eid != null && i.end > i.start);
  const all = sessions(blocks, p.focus);
  const work = [...all.filter(s => !s.pause && !s.optional), ...all.filter(s => !s.pause && s.optional)];

  const queue = sortTasks(tasks.filter(t => t.date === key && !t.done), key)
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
  const capacity = work.filter(s => !s.optional).reduce((n, s) => n + s.end - s.start, 0);
  const load = tasks.filter(t => t.date === key && !t.done).reduce((n, t) => n + t.duration, 0);
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
