// Liens entre les habitudes et le planning.

import { getData, update } from './storage.js';
import { isScheduled, status } from './habits-model.js';
import { toMin } from './planning-model.js';

/* ---------- Tâches faites → habitude "heures de travail" ---------- */

// Recalcule, pour un jour, les habitudes reliées aux tâches (source "taches").
export function syncWorkHabits(date) {
  const { habits, tasks } = getData();
  const linked = habits.filter(h => h.source === 'taches');
  if (!linked.length) return;
  const minutes = tasks.filter(t => t.date === date && t.done).reduce((n, t) => n + t.duration, 0);
  update(d => {
    d.entries[date] ??= {};
    for (const h of linked) {
      // unité en heures par défaut, en minutes si l'habitude est en "min"
      d.entries[date][h.id] = /^min/i.test(h.unit || '') ? minutes : Math.round((minutes / 60) * 100) / 100;
    }
  });
}

/* ---------- Habitudes → créneaux du planning ---------- */

// Ajoute aux éléments du jour un créneau pour chaque habitude qui en a un.
// Les créneaux "auto" prennent le premier moment libre (les temps de repos comptent comme libres).
export function withHabitSlots(items, key, bedtime) {
  const { habits, entries } = getData();
  const values = entries[key] || {};
  const busy = items
    .filter(i => i.kind !== 'repos' && i.kind !== 'sommeil' && !(i.prayer && i.deferred) && i.end > i.start)
    .map(i => [i.start, i.end]);
  const wake = Math.min(...items.filter(i => i.prayer === 'fajr').map(i => i.end), 8 * 60);
  const bed = toMin(bedtime);
  const added = [];

  for (const h of habits) {
    if (!h.slot || !isScheduled(h, key)) continue;
    const len = h.slot.duration;
    let start = null;
    if (h.slot.mode === 'fixed') start = toMin(h.slot.start);
    else start = firstFree(busy, Math.max(wake, toMin(h.slot.after || '07:00')), bed, len);
    if (start === null) {
      added.push({ start: bed, end: bed, label: h.name, kind: 'habit', habitId: h.id, noRoom: true });
      continue;
    }
    busy.push([start, start + len]);
    added.push({
      start, end: start + len, label: h.name, kind: 'habit', habitId: h.id,
      auto: h.slot.mode !== 'fixed', check: h.type === 'check',
      state: status(h, values[h.id] ?? 0), value: values[h.id] ?? 0,
    });
  }
  if (!added.length) return items;

  // Les temps de repos sont raccourcis autour des créneaux d'habitude.
  const out = [];
  for (const it of items) {
    if (it.kind !== 'repos') { out.push(it); continue; }
    let parts = [[it.start, it.end]];
    for (const a of added) {
      parts = parts.flatMap(([s, e]) => (a.end <= s || a.start >= e ? [[s, e]] :
        [[s, a.start], [a.end, e]].filter(([x, y]) => y - x >= 10)));
    }
    parts.forEach(([s, e], i) => out.push({ ...it, start: s, end: e, eid: i === 0 ? it.eid : undefined }));
  }
  return [...out, ...added].sort((a, b) => a.start - b.start || (a.prayer ? 1 : 0) - (b.prayer ? 1 : 0));
}

function firstFree(busy, from, to, len) {
  const sorted = [...busy].sort((a, b) => a[0] - b[0]);
  let t = from;
  for (const [s, e] of sorted) {
    if (e <= t) continue;
    if (s - t >= len) return t;
    t = Math.max(t, e);
  }
  return to - t >= len ? t : null;
}

export function toggleHabit(id, key) {
  update(d => {
    d.entries[key] ??= {};
    d.entries[key][id] = d.entries[key][id] ? 0 : 1;
  });
}
