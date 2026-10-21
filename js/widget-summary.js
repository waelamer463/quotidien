// Résumé léger de la journée, envoyé avec la synchro pour le widget iPhone (Scriptable).
// Le widget n'a pas à recalculer le planning ni les horaires de prière : il lit ce résumé.

import { getData } from './storage.js';
import { dateKey, addDays } from './util.js';
import { buildDay, toMin } from './planning-model.js';
import { schedule } from './scheduler.js';
import { upcoming, daysUntil, readiness, examName } from './exams-model.js';
import { mood } from './mascot.js';

export function widgetSummary() {
  const d = getData(), p = d.planning, today = dateKey();
  const days = {};
  for (const k of [today, addDays(today, 1)]) {
    const built = buildDay(p, k);
    days[k] = {
      blocks: built.items.filter(i => !i.prayer && !['sommeil'].includes(i.kind) && i.end > i.start)
        .map(i => ({ s: i.start, e: i.end, l: i.label, k: i.kind })),
      prayers: built.items.filter(i => i.prayer).map(i => ({ n: i.label, t: i.start, late: Boolean(i.deferred) })),
      wake: built.wake,
    };
  }
  const sched = schedule(p, d.tasks, today);
  const tasks = sched.segments.filter(s => s.kind === 'task' && !s.task.done)
    .sort((a, b) => a.start - b.start).slice(0, 3).map(s => ({ t: s.task.title, s: s.start }));
  for (const t of d.tasks.filter(x => x.date === today && !x.done && !x.duration)) if (tasks.length < 3) tasks.push({ t: t.title, s: null });
  const ex = upcoming(today)[0];
  const c = d.chrono;
  return {
    v: 1, date: today, at: new Date().toISOString(), bed: toMin(p.bedtime), face: mood().face, days, tasks,
    chrono: c ? { startedAt: c.startedAt, accumulated: c.accumulated, paused: c.paused, label: c.label || p.subjects.find(s => s.id === c.subject)?.short || 'Chrono' } : null,
    exam: ex ? { n: examName(ex), d: daysUntil(ex.date, today), r: Math.round(readiness(ex) * 100) } : null,
  };
}
