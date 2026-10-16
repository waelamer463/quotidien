// Tâches dans l'onglet Planning : liste du jour, ajout / modification, reports.

import { getData, update } from './storage.js';
import { dateKey, parseKey, esc, uid } from './util.js';
import { DIFFICULTY, nextWorkDay } from './scheduler.js';
import { openSheet } from './sheet.js';

export const dur = m => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? String(m % 60).padStart(2, '0') : ''}` : `${m} min`);
const shortDay = k => (k === dateKey() ? "aujourd'hui" :
  parseKey(k).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }));

/* ---------- Affichage ---------- */

export function tasksSection(key, sched) {
  const { tasks, planning: p } = getData();
  const today = dateKey();
  const list = tasks.filter(t => t.date === key).sort((a, b) => a.done - b.done);
  const late = key === today ? tasks.filter(t => !t.done && t.date < today) : [];
  const over = sched.overflow;
  const left = sched.overflow.reduce((n, o) => n + o.left, 0);

  return `
    ${late.length ? `
      <div class="card banner">
        <strong>${late.length} tâche${late.length > 1 ? 's' : ''} non terminée${late.length > 1 ? 's' : ''} des jours précédents</strong>
        <p class="small muted">${late.map(t => esc(t.title)).join(', ')}</p>
        <div class="row2">
          <button class="btn small" data-task-act="late-all">Tout mettre aujourd'hui</button>
          <button class="btn small secondary" data-task-act="late-pick">Choisir</button>
        </div>
      </div>` : ''}

    ${over.length && !p.days[key]?.overflowOk ? `
      <div class="card banner warn">
        <strong>Tout ne rentre pas : ${dur(left)} de trop</strong>
        <p class="small muted">${over.map(o => `${esc(o.task.title)} (${dur(o.left)})`).join(', ')}</p>
        <div class="row3">
          <button class="btn small" data-task-act="over-next">Reporter au ${shortDay(nextWorkDay(p, key))}</button>
          <button class="btn small secondary" data-task-act="over-pick">Choisir</button>
          <button class="btn small secondary" data-task-act="over-keep">Laisser</button>
        </div>
      </div>` : ''}

    <div class="tasks-head">
      <span class="section-title" style="margin:0">Tâches</span>
      <span class="small muted">${dur(sched.load)} prévues · ${dur(sched.capacity)} de travail dispo</span>
    </div>
    <div class="tasks">
      ${list.map(t => {
        const o = over.find(x => x.task.id === t.id);
        return `
        <div class="task ${t.done ? 'done' : ''}">
          <button class="task-check" data-task-done="${t.id}" aria-label="${t.done ? 'Marquer non faite' : 'Marquer faite'}">✓</button>
          <button class="task-body" data-task-edit="${t.id}">
            <span class="task-title">${esc(t.title)}</span>
            <span class="small muted">${dur(t.duration)} · <span class="diff d${t.difficulty}">${DIFFICULTY[t.difficulty]}</span>${t.deadline ? ` · pour ${shortDay(t.deadline)}` : ''}${o ? ` · <b class="over-tag">${dur(o.left)} non placée${o.left < t.duration ? 's' : ''}</b>` : ''}</span>
          </button>
        </div>`;
      }).join('') || '<p class="small muted" style="margin:4px 0">Aucune tâche pour ce jour.</p>'}
    </div>
    <button class="btn secondary add-act" data-task-act="add">+ Ajouter une tâche</button>`;
}

// Contenu d'un bloc de travail : tâches placées, pauses, temps libre.
export function blockSegments(segs) {
  if (!segs.length) return '';
  return `<div class="segs">${segs.map(s => {
    const time = `<span class="seg-time">${hm(s.start)}–${hm(s.end)}</span>`;
    if (s.kind === 'pause') return `<div class="seg pause">${time}<span>Pause</span></div>`;
    if (s.kind === 'free') return `<div class="seg free">${time}<span>Temps libre / révisions</span></div>`;
    return `<button class="seg task-seg d${s.task.difficulty}" data-task-edit="${s.task.id}">${time}
      <span>${esc(s.task.title)}${s.part ? ' <small>(partie)</small>' : ''}</span></button>`;
  }).join('')}</div>`;
}

const hm = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/* ---------- Actions ---------- */

// Renvoie true si le clic concernait les tâches (et a été traité).
export function handleTaskClick(e, key, sched, rerender) {
  const t = e.target.closest('[data-task-act],[data-task-done],[data-task-edit]');
  if (!t) return false;
  const ds = t.dataset;
  const { planning: p } = getData();

  if (ds.taskDone) {
    update(d => { const x = d.tasks.find(y => y.id === ds.taskDone); x.done = !x.done; });
  } else if (ds.taskEdit) {
    return editTask(getData().tasks.find(x => x.id === ds.taskEdit), key, rerender), true;
  } else if (ds.taskAct === 'add') {
    return editTask(null, key, rerender), true;
  } else if (ds.taskAct === 'late-all') {
    move(lateTasks().map(x => x.id), dateKey());
  } else if (ds.taskAct === 'late-pick') {
    return pickAndMove(lateTasks(), dateKey(), 'Tâches en retard', rerender), true;
  } else if (ds.taskAct === 'over-next') {
    postpone(sched.overflow, nextWorkDay(p, key));
  } else if (ds.taskAct === 'over-pick') {
    return pickAndMove(sched.overflow.map(o => o.task), nextWorkDay(p, key), 'Que reporter ?', rerender, sched.overflow), true;
  } else if (ds.taskAct === 'over-keep') {
    update(d => { d.planning.days[key] = { ...d.planning.days[key], overflowOk: true }; });
  }
  rerender();
  return true;
}

const lateTasks = () => getData().tasks.filter(t => !t.done && t.date < dateKey());

function move(ids, to) {
  update(d => { d.tasks.forEach(t => { if (ids.includes(t.id)) t.date = to; }); });
}

// Reporte ce qui n'a pas pu être placé. Une tâche placée en partie est coupée en deux :
// la partie placée reste, la suite part au jour choisi.
function postpone(overflow, to) {
  update(d => {
    for (const { task, left } of overflow) {
      const t = d.tasks.find(x => x.id === task.id);
      if (!t) continue;
      if (left < t.duration) {
        t.duration -= left;
        d.tasks.push({ ...t, id: uid(), duration: left, date: to, title: `${t.title.replace(/ \(suite\)$/, '')} (suite)` });
      } else t.date = to;
    }
  });
}

function pickAndMove(list, defaultDay, title, rerender, overflow = null) {
  openSheet({
    title,
    saveLabel: 'Déplacer les tâches cochées',
    body: `
      ${list.map(t => `
        <label class="switch"><input type="checkbox" name="ids" value="${t.id}" checked>
          <span>${esc(t.title)} <small class="muted">(${dur(t.duration)})</small></span></label>`).join('')}
      <label>Vers le jour <input type="date" name="to" value="${defaultDay}"></label>`,
    onSave: f => {
      const to = f.get('to');
      if (!to) return 'Choisis un jour.';
      const ids = f.getAll('ids');
      if (overflow) postpone(overflow.filter(o => ids.includes(o.task.id)), to);
      else move(ids, to);
      rerender();
    },
  });
}

function editTask(t, key, rerender) {
  const { planning: p } = getData();
  const durations = [15, 30, 45, 60, 75, 90, 120, 150, 180, 240, 300, 360, 480];
  const cur = t?.duration || 60;
  if (!durations.includes(cur)) durations.push(cur), durations.sort((a, b) => a - b);

  openSheet({
    title: t ? 'Modifier la tâche' : 'Nouvelle tâche',
    body: `
      <label>Tâche <input name="title" maxlength="80" value="${esc(t?.title || '')}" placeholder="Ex. Exercices d'Analyse ch. 3"></label>
      <div class="grid2">
        <label>Durée estimée
          <select name="duration">${durations.map(m => `<option value="${m}" ${m === cur ? 'selected' : ''}>${dur(m)}</option>`).join('')}</select>
        </label>
        <label>Matière
          <select name="subject"><option value="">—</option>${p.subjects.map(s =>
            `<option value="${s.id}" ${t?.subject === s.id ? 'selected' : ''}>${esc(s.short)}</option>`).join('')}</select>
        </label>
      </div>
      <fieldset><legend>Difficulté / énergie demandée</legend>
        <div class="segmented three-r">
          ${[1, 2, 3].map(d => `<label><input type="radio" name="difficulty" value="${d}" ${(t?.difficulty || 2) === d ? 'checked' : ''}><span>${DIFFICULTY[d]}</span></label>`).join('')}
        </div>
      </fieldset>
      <div class="grid2">
        <label>Jour prévu <input type="date" name="date" value="${t?.date || key}"></label>
        <label>Échéance <input type="date" name="deadline" value="${t?.deadline || ''}"></label>
      </div>`,
    onSave: f => {
      const title = f.get('title').trim();
      if (!title) return 'Donne un nom à la tâche.';
      if (!f.get('date')) return 'Choisis le jour prévu.';
      const next = {
        id: t?.id || uid(),
        created: t?.created || new Date().toISOString(),
        done: t?.done || false,
        title,
        duration: Number(f.get('duration')),
        difficulty: Number(f.get('difficulty')),
        subject: f.get('subject') || null,
        date: f.get('date'),
        deadline: f.get('deadline') || null,
      };
      update(d => {
        const i = d.tasks.findIndex(x => x.id === next.id);
        if (i >= 0) d.tasks[i] = next; else d.tasks.push(next);
        // une nouvelle tâche relance la question "tout ne rentre pas"
        if (d.planning.days[next.date]?.overflowOk) delete d.planning.days[next.date].overflowOk;
      });
      rerender();
    },
    onDelete: t && (() => {
      update(d => { d.tasks = d.tasks.filter(x => x.id !== t.id); });
      rerender();
    }),
  });
}
