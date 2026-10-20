// To-do : ajout rapide, vues Aujourd'hui / Semaine / Plus tard / Boîte, glisser, fiche d'une tâche, reports.

import { getData, update } from './storage.js';
import { dateKey, addDays, parseKey, dayLabel, esc, uid } from './util.js';
import { icon } from './icons.js';
import { openSheet } from './sheet.js';
import { schedule, nextWorkDay } from './scheduler.js';
import { startChrono } from './chrono-view.js';
import { PRIORITY, DIFFICULTY, kindOf, parseQuick, addTask, normalize, materialize, ruleLabel, sortTasks, subProgress } from './todo-model.js';
import { toast } from './toast.js';

export const dur = m => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? String(m % 60).padStart(2, '0') : ''}` : `${m} min`);
const hm = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const short = k => (k === dateKey() ? "aujourd'hui" : k === addDays(dateKey(), 1) ? 'demain'
  : parseKey(k).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }));

let tab = 'jour';

/* ---------- Section to-do de l'onglet Aujourd'hui ---------- */

export function todoSection(day) {
  materialize(day);
  const { tasks, planning: p } = getData();
  const sched = schedule(p, tasks, day);
  const today = dateKey();

  let body = '';
  if (tab === 'jour') {
    const late = day === today ? tasks.filter(t => !t.done && t.date < today) : [];
    const list = sortTasks(tasks.filter(t => t.date === day));
    body = `
      ${late.length ? banner('late', `${late.length} tâche${late.length > 1 ? 's' : ''} en retard`,
        late.map(t => esc(t.title)).join(', '), [['late-all', 'Tout mettre aujourd\'hui'], ['late-pick', 'Choisir']]) : ''}
      ${sched.overflow.length && !p.days[day]?.overflowOk ? banner('warn',
        `Tout ne rentre pas : ${dur(sched.overflow.reduce((n, o) => n + o.left, 0))} de trop`,
        sched.overflow.map(o => `${esc(o.task.title)} (${dur(o.left)})`).join(', '),
        [['over-next', `Reporter ${short(nextWorkDay(p, day))}`], ['over-pick', 'Choisir'], ['over-keep', 'Laisser']]) : ''}
      ${list.length ? `<div class="tasks">${list.map(t => row(t, sched)).join('')}</div>`
        : '<p class="muted small empty">Rien de prévu. Ajoute une tâche ci-dessus.</p>'}
      ${sched.load ? `<p class="small muted load">${dur(sched.load)} de tâches à placer · ${dur(sched.capacity)} de travail dispo</p>` : ''}`;
  } else if (tab === 'semaine') {
    let html = '';
    for (let i = 1; i <= 7; i++) {
      const k = addDays(today, i);
      materialize(k);
      const list = sortTasks(getData().tasks.filter(t => t.date === k && !t.done));
      if (list.length) html += `<h3 class="group">${dayLabel(k)}</h3><div class="tasks">${list.map(t => row(t)).join('')}</div>`;
    }
    body = html || '<p class="muted small empty">Rien de prévu dans les 7 prochains jours.</p>';
  } else if (tab === 'plustard') {
    const limit = addDays(today, 7);
    const groups = {};
    for (const t of sortTasks(tasks.filter(t => !t.done && t.date && t.date > limit)).sort((a, b) => a.date.localeCompare(b.date))) {
      (groups[t.date] ??= []).push(t);
    }
    const { series } = getData();
    body = Object.entries(groups).map(([k, list]) => `
      <h3 class="group">${dayLabel(k)}</h3><div class="tasks">${list.map(t => row(t)).join('')}</div>`).join('')
      || '<p class="muted small empty">Rien de prévu au-delà de 7 jours.</p>';
    if (series.length) {
      body += `<h3 class="group">Répétitions</h3><div class="tasks">${series.map(x => `
        <button class="task series" data-series="${x.id}">
          <span class="task-body"><span class="task-title">${esc(x.title)}</span>
            <span class="small muted">${ruleLabel(x.rule)}${x.until ? ` jusqu'au ${short(x.until)}` : ''}</span></span>
          ${icon('right', 'chev')}
        </button>`).join('')}</div>`;
    }
  } else {
    const inbox = sortTasks(tasks.filter(t => !t.done && !t.date));
    body = inbox.length ? `<p class="small muted empty">Glisse à gauche pour planifier aujourd'hui, ou touche une tâche pour lui donner un jour.</p>
      <div class="tasks">${inbox.map(t => row(t)).join('')}</div>`
      : '<p class="muted small empty">Boîte vide. Ajoute ici tes idées et tâches sans date (ou écris « plus tard »).</p>';
  }

  return `
    <form class="quick" data-quick>
      <input name="q" autocomplete="off" enterkeyhint="done" placeholder="${tab === 'inbox' ? 'Noter une idée, une tâche sans date…' : 'Ajouter… ex. « Exos Analyse 2h !! vendredi »'}" aria-label="Ajouter une tâche">
      <button class="icon-btn" type="submit" aria-label="Ajouter">${icon('plus')}</button>
    </form>
    <div class="quick-preview" hidden></div>
    <div class="todo-tabs segmented four">
      ${[['jour', day === today ? "Aujourd'hui" : 'Ce jour'], ['semaine', 'Semaine'], ['plustard', 'Plus tard'], ['inbox', 'Boîte']].map(([k, l]) =>
        `<button class="${tab === k ? 'on' : ''}" data-todo-tab="${k}">${l}${k === 'inbox' && inboxCount() ? `<i class="count">${inboxCount()}</i>` : ''}</button>`).join('')}
    </div>
    ${body}`;
}

const inboxCount = () => getData().tasks.filter(t => !t.done && !t.date).length;

function banner(cls, title, text, actions) {
  return `
    <div class="card banner ${cls}">
      <strong>${title}</strong>
      <p class="small muted">${text}</p>
      <div class="row${actions.length}">${actions.map(([a, l], i) =>
        `<button class="btn small ${i ? 'secondary' : ''}" data-todo-act="${a}">${l}</button>`).join('')}</div>
    </div>`;
}

function row(t, sched) {
  const subj = t.subject && getData().planning.subjects.find(s => s.id === t.subject);
  const k = kindOf(t);
  const seg = sched?.segments.find(s => s.task?.id === t.id);
  const over = sched?.overflow.find(o => o.task.id === t.id);
  const sp = subProgress(t);
  const meta = [
    k === 'bloc' ? `${t.start}–${t.end}` : k === 'duree' ? dur(t.duration) : '',
    t.difficulty === 3 ? 'difficile' : t.difficulty === 1 ? 'facile' : '',
    seg && !t.done ? `placée à ${hm(seg.start)}` : '',
    over ? `<b class="over-tag">${dur(over.left)} non placé</b>` : '',
    t.deadline ? `pour ${short(t.deadline)}` : '',
  ].filter(Boolean);
  return `
    <div class="task swipe p${t.priority} ${t.done ? 'done' : ''}" data-task-id="${t.id}">
      <span class="sw-bg sw-done">${icon('check')}Terminer</span><span class="sw-bg sw-later">Demain</span>
      <button class="task-check" data-todo-done="${t.id}" aria-label="${t.done ? 'Marquer non faite' : 'Marquer faite'}">${icon('check')}</button>
      <button class="task-body" data-todo-edit="${t.id}">
        <span class="task-title">${t.priority > 1 ? `<i class="flag p${t.priority}" title="${PRIORITY[t.priority]}"></i>` : ''}${esc(t.title)}</span>
        ${meta.length || subj || t.seriesId || t.date === null ? `<span class="small muted task-meta">
          ${subj ? `<i class="subj-dot sm" style="background:${subj.color}"></i>${esc(subj.short)}` : ''}
          ${tab !== 'jour' && t.date === null ? 'sans date' : ''}
          ${meta.join(' · ')}${t.seriesId ? ` ${icon('sync', 'tiny')}` : ''}</span>` : ''}
        ${sp ? `<span class="subbar"><span class="bar"><i style="width:${(sp.done / sp.n) * 100}%"></i></span><span class="mono">${sp.done}/${sp.n}</span></span>` : ''}
      </button>
      ${t.done ? '' : `<button class="play" data-todo-play="${t.id}" aria-label="Lancer le chrono"><svg class="ic" viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5z"/></svg></button>`}
    </div>`;
}

/* ---------- Actions ---------- */

// Gère les clics de la section ; renvoie true si traité.
export function handleTodoClick(e, day, rerender) {
  const b = e.target.closest('[data-todo-tab],[data-todo-done],[data-todo-edit],[data-todo-act],[data-series],[data-todo-play]');
  if (!b) return false;
  const ds = b.dataset;
  const { planning: p, tasks } = getData();

  if (ds.todoPlay) {
    const t = tasks.find(x => x.id === ds.todoPlay);
    startChrono({ subject: t.subject, taskId: t.id, label: t.title, planned: t.duration });
    return true;
  }
  if (ds.todoTab) tab = ds.todoTab;
  else if (ds.todoDone) toggleDone(ds.todoDone);
  else if (ds.todoEdit) { editTask(tasks.find(t => t.id === ds.todoEdit), rerender); return true; }
  else if (ds.series) { editSeries(getData().series.find(s => s.id === ds.series), rerender); return true; }
  else {
    const sched = schedule(p, tasks, day);
    const late = tasks.filter(t => !t.done && t.date < dateKey());
    if (ds.todoAct === 'late-all') move(late.map(t => t.id), dateKey());
    else if (ds.todoAct === 'late-pick') { pick(late, dateKey(), 'Tâches en retard', rerender); return true; }
    else if (ds.todoAct === 'over-next') postpone(sched.overflow, nextWorkDay(p, day));
    else if (ds.todoAct === 'over-pick') { pick(sched.overflow.map(o => o.task), nextWorkDay(p, day), 'Que reporter ?', rerender, sched.overflow); return true; }
    else if (ds.todoAct === 'over-keep') update(d => { d.planning.days[day] = { ...d.planning.days[day], overflowOk: true }; });
  }
  rerender();
  return true;
}

// Ajout rapide : aperçu en direct pendant la frappe, ajout à la validation.
export function bindQuick(root, day, rerender) {
  const form = root.querySelector('[data-quick]');
  if (!form) return;
  const input = form.querySelector('input');
  const preview = root.querySelector('.quick-preview');
  const subjects = getData().planning.subjects;

  input.addEventListener('input', () => {
    const v = input.value.trim();
    if (!v) { preview.hidden = true; return; }
    const r = parseQuick(v, day, subjects, { defaultDate: defaultDate(day) });
    const chips = [
      r.date === null ? 'Boîte' : r.date !== day ? short(r.date) : '',
      r.difficulty !== 2 ? DIFFICULTY[r.difficulty] : '',
      r.subtasks?.length ? `${r.subtasks.length} sous-tâches` : '',
      r.start ? `${r.start}–${r.end}` : r.duration ? dur(r.duration) : '',
      r.priority > 1 ? PRIORITY[r.priority] : '',
      r.deadline ? `pour ${short(r.deadline)}` : '',
      r.rule ? ruleLabel(r.rule) : '',
      r.subject ? subjects.find(s => s.id === r.subject)?.short : '',
    ].filter(Boolean);
    preview.hidden = false;
    preview.innerHTML = `<b>${esc(r.title || '…')}</b>${chips.map(c => `<span class="chip-mini">${esc(c)}</span>`).join('')}
      <button type="button" class="link small" data-more>Plus d'options</button>`;
  });
  preview.addEventListener('click', e => {
    if (!e.target.closest('[data-more]')) return;
    const r = parseQuick(input.value, day, subjects, { defaultDate: defaultDate(day) });
    editTask({ ...r, id: null }, rerender);
  });
  form.addEventListener('submit', e => {
    e.preventDefault();
    const r = parseQuick(input.value, day, subjects, { defaultDate: defaultDate(day) });
    if (!r.title) return;
    addTask(r);
    if (r.date === day) update(d => { if (d.planning.days[day]?.overflowOk) delete d.planning.days[day].overflowOk; });
    rerender();
    root.querySelector('[data-quick] input')?.focus();
  });

  bindSwipe(root, rerender);
}

const defaultDate = day => (tab === 'inbox' ? null : day);

/* ---------- Glisser : à droite = terminer, à gauche = demain ---------- */

function bindSwipe(root, rerender) {
  root._swipeRerender = rerender;      // le conteneur est réutilisé d'un affichage à l'autre :
  if (root._swipeBound) return;        // on ne pose les écouteurs qu'une fois
  root._swipeBound = true;
  let st = null;
  let swallowClick = false;
  const THRESHOLD = 0.32;
  const pt = e => (e.touches ? e.touches[0] : e);

  const start = e => {
    const el = e.target.closest('.task.swipe');
    if (!el || e.target.closest('button.play')) return;
    st = { el, x0: pt(e).clientX, y0: pt(e).clientY, dx: 0, mode: null };
  };
  const move = e => {
    if (!st) return;
    const dx = pt(e).clientX - st.x0, dy = pt(e).clientY - st.y0;
    if (!st.mode) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      st.mode = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
      if (st.mode === 'h') st.el.classList.add('swiping');
    }
    if (st.mode !== 'h') return;
    e.preventDefault();
    st.dx = dx;
    st.el.style.setProperty('--dx', `${dx}px`);
    st.el.classList.toggle('to-done', dx > 0);
    st.el.classList.toggle('to-later', dx < 0);
    st.el.classList.toggle('armed', Math.abs(dx) > st.el.offsetWidth * THRESHOLD);
  };
  const end = e => {
    if (!st) return;
    const { el, dx, mode } = st;
    st = null;
    if (mode !== 'h') return;
    e.preventDefault?.();
    swallowClick = true;
    setTimeout(() => { swallowClick = false; }, 50);
    const id = el.dataset.taskId;
    const again = root._swipeRerender;
    if (Math.abs(dx) > el.offsetWidth * THRESHOLD) {
      el.style.setProperty('--dx', `${dx > 0 ? 120 : -120}%`);
      el.classList.add('leaving');
      setTimeout(() => (dx > 0 ? swipeDone(id, again) : swipeLater(id, again)), 220);
    } else {
      el.classList.remove('swiping', 'to-done', 'to-later', 'armed');
      el.style.removeProperty('--dx');
    }
  };
  root.addEventListener('touchstart', start, { passive: true });
  root.addEventListener('touchmove', move, { passive: false });
  root.addEventListener('touchend', end);
  root.addEventListener('mousedown', start);
  root.addEventListener('mousemove', move);
  root.addEventListener('mouseup', end);
  // après un glissement à la souris, le clic qui suit ne doit pas ouvrir la tâche
  root.addEventListener('click', e => { if (swallowClick) { e.stopPropagation(); e.preventDefault(); } }, true);
}

function swipeDone(id, rerender) {
  const before = snapshot(id);
  update(d => { const t = d.tasks.find(x => x.id === id); t.done = true; t.doneAt = new Date().toISOString(); });
  rerender();
  toast('Tâche terminée', () => { restore(before); rerender(); });
}

function swipeLater(id, rerender) {
  const before = snapshot(id);
  const t = getData().tasks.find(x => x.id === id);
  const today = dateKey();
  // boîte → aujourd'hui ; sinon → le lendemain du jour prévu (au moins demain)
  const to = !t.date ? today : addDays(t.date < today ? today : t.date, 1);
  update(d => { const x = d.tasks.find(y => y.id === id); x.date = to; if (t.date) x.postponed = (x.postponed || 0) + 1; });
  rerender();
  toast(t.date ? `Reportée à ${short(to)}` : 'Planifiée aujourd\'hui', () => { restore(before); rerender(); });
}

const snapshot = id => JSON.parse(JSON.stringify(getData().tasks.find(x => x.id === id)));
const restore = t => update(d => { const i = d.tasks.findIndex(x => x.id === t.id); if (i >= 0) d.tasks[i] = t; });

function toggleDone(id) {
  update(d => {
    const t = d.tasks.find(x => x.id === id);
    t.done = !t.done;
    t.doneAt = t.done ? new Date().toISOString() : null;
  });
}

function move(ids, to) {
  update(d => d.tasks.forEach(t => {
    if (ids.includes(t.id) && t.date !== to) { t.date = to; t.postponed = (t.postponed || 0) + 1; }
  }));
}

// Une tâche placée en partie est coupée : la partie placée reste, la suite part au jour choisi.
function postpone(overflow, to) {
  update(d => {
    for (const { task, left } of overflow) {
      const t = d.tasks.find(x => x.id === task.id);
      if (!t) continue;
      if (left < t.duration) {
        t.duration -= left;
        d.tasks.push(normalize({ ...t, id: uid(), seriesId: null, duration: left, date: to,
          postponed: (t.postponed || 0) + 1, title: `${t.title.replace(/ \(suite\)$/, '')} (suite)` }));
      } else { t.date = to; t.postponed = (t.postponed || 0) + 1; }
    }
  });
}

function pick(list, defaultDay, title, rerender, overflow = null) {
  openSheet({
    title, saveLabel: 'Déplacer les tâches cochées',
    body: `${list.map(t => `
        <label class="switch"><input type="checkbox" name="ids" value="${t.id}" checked>
          <span>${esc(t.title)}${t.duration ? ` <small class="muted">(${dur(t.duration)})</small>` : ''}</span></label>`).join('')}
      <label>Vers le jour <input type="date" name="to" value="${defaultDay}"></label>`,
    onSave: f => {
      const to = f.get('to');
      if (!to) return 'Choisis un jour.';
      const ids = f.getAll('ids');
      if (overflow) postpone(overflow.filter(o => ids.includes(o.task.id)), to); else move(ids, to);
      rerender();
    },
  });
}

/* ---------- Fiche d'une tâche ---------- */

const DURATIONS = [15, 30, 45, 60, 75, 90, 120, 150, 180, 240, 300, 360, 480];
const WEEK = [[1, 'L'], [2, 'M'], [3, 'M'], [4, 'J'], [5, 'V'], [6, 'S'], [0, 'D']];

export function editTask(t, rerender) {
  const { planning: p, series } = getData();
  const isNew = !t?.id;
  t = { priority: 1, difficulty: 2, date: dateKey(), subtasks: [], ...t };
  const k = kindOf(t);
  const durations = [...new Set([...DURATIONS, t.duration || 60])].sort((a, b) => a - b);
  const s = t.seriesId && series.find(x => x.id === t.seriesId);

  openSheet({
    title: isNew ? 'Nouvelle tâche' : 'Tâche',
    saveLabel: isNew ? 'Ajouter' : 'Enregistrer',
    body: `
      <label>Tâche <input name="title" maxlength="100" value="${esc(t.title || '')}"></label>
      <fieldset><legend>Type</legend>
        <div class="segmented three-r">
          ${[['simple', 'Simple'], ['duree', 'Avec durée'], ['bloc', 'Horaire']].map(([v, l]) =>
            `<label><input type="radio" name="kind" value="${v}" ${k === v ? 'checked' : ''}><span>${l}</span></label>`).join('')}
        </div>
      </fieldset>
      <label class="k-duree">Durée estimée
        <select name="duration">${durations.map(m => `<option value="${m}" ${m === (t.duration || 60) ? 'selected' : ''}>${dur(m)}</option>`).join('')}</select>
      </label>
      <div class="grid2 k-bloc">
        <label>Début <input type="time" name="start" value="${t.start || '14:00'}"></label>
        <label>Fin <input type="time" name="end" value="${t.end || '15:00'}"></label>
      </div>
      <fieldset><legend>Priorité</legend>
        <div class="segmented three-r">
          ${[1, 2, 3].map(v => `<label><input type="radio" name="priority" value="${v}" ${t.priority === v ? 'checked' : ''}><span>${PRIORITY[v]}</span></label>`).join('')}
        </div>
      </fieldset>
      <fieldset><legend>Difficulté</legend>
        <div class="segmented three-r">
          ${[1, 2, 3].map(v => `<label><input type="radio" name="difficulty" value="${v}" ${t.difficulty === v ? 'checked' : ''}><span>${DIFFICULTY[v]}</span></label>`).join('')}
        </div>
      </fieldset>
      <fieldset><legend>Sous-tâches</legend>
        <div class="subtasks">
          ${t.subtasks.map(x => subRow(x)).join('')}
          <div class="sub-add"><input placeholder="Ajouter une sous-tâche" data-sub-new><button type="button" class="icon-btn" data-sub-add aria-label="Ajouter">${icon('plus')}</button></div>
        </div>
      </fieldset>
      <div class="grid2">
        <label>Jour <span class="small muted">(vide = boîte)</span><input type="date" name="date" value="${t.date || ''}"></label>
        <label>Échéance <input type="date" name="deadline" value="${t.deadline || ''}"></label>
      </div>
      <label>Matière
        <select name="subject"><option value="">—</option>${p.subjects.map(x =>
          `<option value="${x.id}" ${t.subject === x.id ? 'selected' : ''}>${esc(x.short)}</option>`).join('')}</select>
      </label>
      ${isNew ? repeatFields(t.rule) : s ? `<p class="small muted">${icon('sync', 'tiny')} ${ruleLabel(s.rule)}. Les changements ne touchent que ce jour.</p>` : ''}
      ${!isNew && t.postponed ? `<p class="small muted">Reportée ${t.postponed} fois.</p>` : ''}`,
    onSave: f => {
      const title = f.get('title').trim();
      if (!title) return 'Donne un nom à la tâche.';
      const kind = f.get('kind');
      const fields = {
        title, date: f.get('date') || null,
        priority: Number(f.get('priority')), difficulty: Number(f.get('difficulty')),
        subtasks: readSubtasks(), deadline: f.get('deadline') || null, subject: f.get('subject') || null,
        start: kind === 'bloc' ? f.get('start') : null, end: kind === 'bloc' ? f.get('end') : null,
        duration: kind === 'duree' ? Number(f.get('duration')) : null,
      };
      if (kind === 'bloc') {
        if (!fields.start || !fields.end || fields.end <= fields.start) return 'La fin doit être après le début.';
        const [a, b] = [fields.start, fields.end].map(x => x.split(':').map(Number)).map(([h, m]) => h * 60 + m);
        fields.duration = b - a;
      }
      if (fields.subtasks.length && fields.subtasks.every(x => x.done) && !isNew && !t.done) {
        fields.done = true;
        fields.doneAt = new Date().toISOString();
      }
      if (isNew) {
        const rule = readRule(f, fields.date || dateKey());
        addTask({ ...fields, rule });
      } else {
        update(d => {
          const x = d.tasks.find(y => y.id === t.id);
          if (x.date !== fields.date) x.postponed = (x.postponed || 0) + 1;
          Object.assign(x, fields);
        });
      }
      rerender();
    },
    onDelete: !isNew && (() => {
      update(d => {
        d.tasks = d.tasks.filter(y => y.id !== t.id);
        if (t.seriesId) d.series.find(x => x.id === t.seriesId)?.skip.push(t.date); // ne pas la recréer
      });
      rerender();
    }),
  });

  // champs visibles selon le type et la répétition
  const form = document.querySelector('.sheet');
  const subs = form.querySelector('.subtasks');
  const addSub = () => {
    const inp = subs.querySelector('[data-sub-new]');
    if (!inp.value.trim()) return;
    inp.closest('.sub-add').insertAdjacentHTML('beforebegin', subRow({ id: uid(), title: inp.value.trim(), done: false }));
    inp.value = '';
    inp.focus();
  };
  subs.addEventListener('click', e => {
    if (e.target.closest('[data-sub-add]')) addSub();
    if (e.target.closest('[data-sub-del]')) e.target.closest('.sub-row').remove();
  });
  subs.querySelector('[data-sub-new]').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addSub(); } });
  function readSubtasks() {
    return [...subs.querySelectorAll('.sub-row')].map(r => ({
      id: r.dataset.id, title: r.querySelector('[data-sub-title]').value.trim(), done: r.querySelector('[data-sub-done]').checked,
    })).filter(x => x.title);
  }
  const sync = () => {
    form.dataset.kind = form.querySelector('[name=kind]:checked').value;
    const r = form.querySelector('[name=repeat]');
    if (r) form.dataset.repeat = r.value;
  };
  form.addEventListener('change', sync);
  sync();
}

function subRow(x) {
  return `
    <div class="sub-row" data-id="${x.id}">
      <input type="checkbox" data-sub-done ${x.done ? 'checked' : ''} aria-label="Faite">
      <input data-sub-title value="${esc(x.title)}" aria-label="Sous-tâche">
      <button type="button" class="icon-btn sm-btn" data-sub-del aria-label="Retirer">${icon('close')}</button>
    </div>`;
}

function repeatFields(rule) {
  return `
    <label>Répétition
      <select name="repeat">
        <option value="">Ne se répète pas</option>
        <option value="day" ${rule?.type === 'day' ? 'selected' : ''}>Tous les jours</option>
        <option value="week" ${rule?.type === 'week' ? 'selected' : ''}>Certains jours de la semaine</option>
      </select>
    </label>
    <div class="r-week">
      <div class="days">${WEEK.map(([d, l]) => `<label><input type="checkbox" name="rdays" value="${d}" ${rule?.days?.includes(d) ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>
      <label style="margin-top:10px">Toutes les … semaines <input name="interval" inputmode="numeric" value="${rule?.interval || 1}"></label>
    </div>`;
}

function readRule(f, date) {
  const type = f.get('repeat');
  if (!type) return null;
  if (type === 'day') return { type, interval: 1 };
  const days = f.getAll('rdays').map(Number);
  return { type, days: days.length ? days : [parseKey(date).getDay()], interval: Math.max(1, parseInt(f.get('interval'), 10) || 1) };
}

function editSeries(s, rerender) {
  openSheet({
    title: 'Répétition',
    saveLabel: 'Enregistrer',
    body: `
      <label>Tâche <input name="title" value="${esc(s.title)}"></label>
      <p class="small muted">${ruleLabel(s.rule)}, depuis le ${short(s.from)}.</p>
      <label>Arrêter après le <input type="date" name="until" value="${s.until || ''}"></label>
      <p class="small muted">Supprimer arrête la répétition. Les tâches déjà faites sont conservées.</p>`,
    onSave: f => {
      const title = f.get('title').trim();
      if (!title) return 'Donne un nom.';
      update(d => {
        const x = d.series.find(y => y.id === s.id);
        x.title = title;
        x.until = f.get('until') || null;
        d.tasks = d.tasks.filter(t => t.seriesId !== s.id || t.done || !x.until || t.date <= x.until);
      });
      rerender();
    },
    onDelete: () => {
      update(d => {
        d.series = d.series.filter(y => y.id !== s.id);
        d.tasks = d.tasks.filter(t => t.seriesId !== s.id || t.done || t.date < dateKey());
      });
      rerender();
    },
  });
}

/* ---------- Dans le planning ---------- */

// Blocs horaires de la to-do pour un jour, sous forme d'éléments de planning.
export function taskBlocks(key) {
  const toMin = s => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
  return getData().tasks.filter(t => t.date === key && t.start && t.end).map(t => ({
    start: toMin(t.start), end: toMin(t.end), label: t.title, kind: 'tache',
    taskId: t.id, done: t.done, priority: t.priority,
  }));
}

export function blockSegments(segs) {
  if (!segs.length) return '';
  return `<div class="segs">${segs.map(s => {
    const time = `<span class="seg-time">${hm(s.start)}–${hm(s.end)}</span>`;
    if (s.kind === 'pause') return `<div class="seg pause">${time}<span>Pause</span></div>`;
    if (s.kind === 'free') return `<div class="seg free">${time}<span>Temps libre</span></div>`;
    return `<button class="seg task-seg p${s.task.priority}" data-todo-edit="${s.task.id}">${time}
      <span>${esc(s.task.title)}${s.part ? ' <small>(partie)</small>' : ''}</span></button>`;
  }).join('')}</div>`;
}
