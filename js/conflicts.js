// Chevauchements dans le planning d'un jour, et solutions proposées.

import { toHHMM } from './planning-model.js';

// Temps "souples" : on peut y mettre autre chose sans conflit.
const soft = it => it.kind === 'repos' || it.kind === 'sommeil' || it.optional || it.prayer;
// Une tâche de la to-do pendant un bloc de travail, c'est normal.
const compatible = (a, b) => [a.kind, b.kind].includes('tache') && [a.kind, b.kind].includes('travail');

export const brickKey = it => (it.taskId ? `t:${it.taskId}` : `${it.kind}:${it.label}`);
const movable = it => Boolean(it.taskId) || it.eid != null;
const len = it => it.end - it.start;

export function findConflicts(items, accepted = []) {
  const bricks = items.filter(i => !soft(i) && i.end > i.start);
  const out = [];
  for (let i = 0; i < bricks.length; i++) {
    for (let j = i + 1; j < bricks.length; j++) {
      const [a, b] = [bricks[i], bricks[j]];
      if (a.start >= b.end || b.start >= a.end || compatible(a, b)) continue;
      const id = [brickKey(a), brickKey(b)].sort().join('|');
      if (!accepted.includes(id)) out.push({ a, b, id });
    }
  }
  return out;
}

// Regroupe les chevauchements par brique à déplacer : une tâche qui chevauche
// deux cours d'affilée donne un seul problème, avec des solutions qui règlent tout.
export function groupConflicts(conflicts) {
  const groups = new Map();
  for (const c of conflicts) {
    let [fixed, flex] = pick(c.a, c.b);
    if (!movable(flex) && movable(fixed)) [fixed, flex] = [flex, fixed];
    const g = groups.get(flex) || { flex, others: [], ids: [] };
    g.others.push(fixed);
    g.ids.push(c.id);
    groups.set(flex, g);
  }
  return [...groups.values()];
}

// Solutions concrètes, vérifiées : aucune ne crée de nouveau chevauchement.
export function suggestions({ flex, others, ids }, items) {
  const out = [];
  const L = len(flex);
  const ok = (it, s, e) => e - s >= 15 && s >= 5 * 60 && e <= 24 * 60 && !items.some(o =>
    o !== it && !soft(o) && o.end > o.start && !compatible(o, it) && s < o.end && o.start < e);
  const add = (label, it, start, end) => {
    if (ok(it, start, end) && !out.some(x => x.start === start && x.end === end && x.it === it)) out.push({ label, it, start, end });
  };

  if (movable(flex)) {
    const after = Math.max(...others.map(o => o.end));
    const before = Math.min(...others.map(o => o.start));
    add(`${flex.label} juste après : ${toHHMM(after)}–${toHHMM(after + L)}`, flex, after, after + L);
    const free = freeSlot(items, flex, L);
    if (free !== null) add(`${flex.label} au prochain créneau libre : ${toHHMM(free)}–${toHHMM(free + L)}`, flex, free, free + L);
    add(`${flex.label} juste avant : ${toHHMM(before - L)}–${toHHMM(before)}`, flex, before - L, before);
    if (flex.start < before) add(`Raccourcir ${flex.label} : ${toHHMM(flex.start)}–${toHHMM(before)}`, flex, flex.start, before);
    if (flex.end > after) add(`Raccourcir ${flex.label} : ${toHHMM(after)}–${toHHMM(flex.end)}`, flex, after, flex.end);
  }
  // raccourcir l'autre brique seulement si elle est seule en cause et que ce n'est pas un cours
  for (const o of others.length === 1 ? others.filter(o => movable(o) && o.kind !== 'cours') : []) {
    if (o.start < flex.start) add(`Raccourcir ${o.label} : ${toHHMM(o.start)}–${toHHMM(flex.start)}`, o, o.start, flex.start);
    if (o.end > flex.end) add(`Raccourcir ${o.label} : ${toHHMM(flex.end)}–${toHHMM(o.end)}`, o, flex.end, o.end);
  }
  const res = out.slice(0, 3);
  if (flex.taskId) res.push({ label: `Reporter ${flex.label} à demain`, it: flex, tomorrow: true });
  res.push({ label: 'Garder tel quel', accept: ids });
  return res;
}

function pick(a, b) {
  if (a.taskId && !b.taskId) return [b, a];
  if (b.taskId && !a.taskId) return [a, b];
  if (len(a) !== len(b)) return len(a) < len(b) ? [b, a] : [a, b];
  return a.start <= b.start ? [a, b] : [b, a];
}

// Premier trou assez long après le début de la brique (sinon avant), hors temps souples.
function freeSlot(items, it, L) {
  const busy = items.filter(i => i !== it && !soft(i) && i.end > i.start && !compatible(i, it)).map(i => [i.start, i.end])
    .sort((x, y) => x[0] - y[0]);
  const gaps = [];
  let t = 6 * 60;
  for (const [s, e] of busy) { if (s - t >= L) gaps.push(t); t = Math.max(t, e); }
  if (23 * 60 - t >= L) gaps.push(t);
  return gaps.find(g => g >= it.start) ?? gaps.at(-1) ?? null;
}
