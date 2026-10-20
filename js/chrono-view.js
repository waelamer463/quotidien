// Page Chrono, barre flottante et fiches associées.

import { getData, update } from './storage.js';
import { dateKey, esc } from './util.js';
import { icon } from './icons.js';
import { openSheet } from './sheet.js';
import { ask, tell } from './dialog.js';
import { toast } from './toast.js';
import { emptyState } from './empty.js';
import { running, elapsedMs, start, pause, resume, stop, cancel, addManual, removeSession,
  minutesOn, minutesBySubject, weekRange, fmtClock, fmtMin } from './chrono.js';

const PLANNED = [0, 25, 45, 60, 90, 120, 150, 180];
const R = 52, C = 2 * Math.PI * R;

const subjectOf = id => getData().planning.subjects.find(s => s.id === id);

// Lance le chrono puis ouvre la page Chrono.
export async function startChrono(opts) {
  if (running() && !await ask({ title: 'Un chrono tourne déjà', text: 'L\'arrêter (la session est enregistrée) et lancer celui-ci ?', ok: 'Lancer' })) return;
  if (running()) stop();
  start(opts);
  location.hash = '#chrono';
}

/* ---------- Page ---------- */

export function render(el) {
  const c = running();
  const today = dateKey();
  const sessions = getData().sessions.filter(s => s.date === today).slice().reverse();
  const [from, to] = weekRange(today);
  const week = minutesBySubject(from, to);
  const subjects = getData().planning.subjects;

  el.innerHTML = `
    ${c ? runningCard(c) : startForm(subjects)}

    <div class="ess-head"><h2 class="section-title">Aujourd'hui</h2>
      <span class="mono small muted" data-chrono-today>${fmtMin(minutesOn(today))}</span></div>
    ${sessions.length ? `<div class="tasks">${sessions.map(s => {
      const sub = subjectOf(s.subject);
      const diff = s.planned ? s.minutes - s.planned : null;
      return `
        <div class="task">
          <span class="subj-dot" style="background:${sub?.color || 'var(--muted)'}"></span>
          <span class="task-body"><span class="task-title">${esc(s.label || sub?.short || 'Session')}</span>
            <span class="small muted mono">${s.start}–${s.end} · ${fmtMin(s.minutes)}${s.planned ? ` / ${fmtMin(s.planned)} prévu` : ''}${diff !== null ? ` (${diff > 0 ? '+' : ''}${diff} min)` : ''}</span></span>
          <button class="icon-btn sm-btn" data-del-session="${s.id}" aria-label="Supprimer">${icon('close')}</button>
        </div>`;
    }).join('')}</div>` : emptyState('Aucune session aujourd\'hui', 'Lance le chrono ci-dessus, ou depuis le ▶ d\'une tâche.')}
    <button class="btn secondary add-act" data-manual>${icon('plus')}Ajouter une session oubliée</button>

    <div class="ess-head"><h2 class="section-title">Cette semaine</h2><a class="link small" href="#planning/matieres">Objectifs</a></div>
    <div class="subj-rings">
      ${subjects.map(s => {
        const m = week[s.id] || 0;
        const goal = (s.weeklyGoal || 0) * 60;
        const ratio = goal ? Math.min(1, m / goal) : (m ? 1 : 0);
        return `
          <div class="subj-ring" style="--sc:${s.color}">
            <svg viewBox="0 0 64 64"><circle class="t" cx="32" cy="32" r="26"/>
              <circle class="v" cx="32" cy="32" r="26" style="stroke-dasharray:${2 * Math.PI * 26};stroke-dashoffset:${2 * Math.PI * 26 * (1 - ratio)}"/></svg>
            <b class="mono">${fmtMin(m)}${goal ? `<small>/${s.weeklyGoal}h</small>` : ''}</b>
            <span>${esc(s.short)}</span>
          </div>`;
      }).join('')}
    </div>`;

  el.onclick = async e => {
    const t = e.target.closest('[data-act],[data-del-session],[data-manual],[data-pick-subject]');
    if (!t) return;
    if (t.dataset.pickSubject !== undefined) {
      el.querySelectorAll('[data-pick-subject]').forEach(x => x.classList.toggle('on', x === t));
      return;
    }
    if (t.dataset.delSession) {
      const s = getData().sessions.find(x => x.id === t.dataset.delSession);
      removeSession(s.id);
      toast('Session supprimée', () => { update(d => { d.sessions.push(s); }); render(el); });
    }
    else if ('manual' in t.dataset) return manualSheet(() => render(el));
    else if (t.dataset.act === 'start') {
      const subj = el.querySelector('[data-pick-subject].on')?.dataset.pickSubject || null;
      start({ subject: subj || null, label: el.querySelector('[name=label]').value.trim(), planned: Number(el.querySelector('[name=planned]').value) || null });
    }
    else if (t.dataset.act === 'pause') pause();
    else if (t.dataset.act === 'resume') resume();
    else if (t.dataset.act === 'stop') return finish(() => render(el));
    else if (t.dataset.act === 'cancel') { if (await ask({ title: 'Annuler ce chrono ?', text: 'Le temps compté ne sera pas enregistré.', ok: 'Annuler le chrono', cancel: 'Continuer', danger: true })) cancel(); }
    render(el);
    renderBar();
  };
  return 'Chrono';
}

function runningCard(c) {
  const sub = subjectOf(c.subject);
  const ms = elapsedMs(c);
  return `
    <div class="card chrono-card">
      <span class="chip subj-chip"><i style="background:${sub?.color || 'var(--accent)'}"></i>${esc([sub?.short, c.label].filter(Boolean).join(' · ') || 'Session libre')}</span>
      <div class="big-ring">
        <svg viewBox="0 0 120 120"><circle class="t" cx="60" cy="60" r="${R}"/>
          <circle class="v" data-chrono-ring cx="60" cy="60" r="${R}" style="stroke-dasharray:${C};stroke-dashoffset:${ringOffset(c, ms)}"/></svg>
        <div class="time"><b class="mono" data-chrono-time>${fmtClock(ms)}</b>
          <span>${c.paused ? 'en pause' : c.planned ? `sur ${fmtMin(c.planned)} prévues` : 'session libre'}</span></div>
      </div>
      <div class="controls">
        <button class="round-btn" data-act="cancel" aria-label="Annuler">${icon('close')}</button>
        <button class="round-btn main" data-act="${c.paused ? 'resume' : 'pause'}" aria-label="${c.paused ? 'Reprendre' : 'Pause'}">
          ${c.paused ? '<svg class="ic" viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5z"/></svg>' : '<svg class="ic" viewBox="0 0 24 24"><path d="M9 6v12M15 6v12"/></svg>'}</button>
        <button class="round-btn" data-act="stop" aria-label="Terminer"><svg class="ic" viewBox="0 0 24 24"><rect x="6.5" y="6.5" width="11" height="11" rx="2"/></svg></button>
      </div>
    </div>`;
}

function ringOffset(c, ms) {
  const base = (c.planned || 60) * 60000; // sans durée prévue : un tour par heure
  const ratio = c.planned ? Math.min(1, ms / base) : (ms % base) / base;
  return C * (1 - ratio);
}

function startForm(subjects) {
  return `
    <div class="card start-card">
      <h2>Lancer un chrono</h2>
      <div class="subj-pick">
        ${subjects.map(s => `<button class="chip" data-pick-subject="${s.id}"><i style="background:${s.color}"></i>${esc(s.short)}</button>`).join('')}
        <button class="chip" data-pick-subject="">Autre</button>
      </div>
      <input name="label" placeholder="Ce que tu fais (facultatif)" maxlength="60">
      <label class="planned">Durée prévue
        <select name="planned">${PLANNED.map(m => `<option value="${m}" ${m === 120 ? 'selected' : ''}>${m ? fmtMin(m) : 'Libre'}</option>`).join('')}</select>
      </label>
      <button class="btn" data-act="start"><svg class="ic" viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5z"/></svg>Démarrer</button>
    </div>`;
}

// Arrêt : enregistre, puis propose de terminer la tâche liée.
function finish(after) {
  const c = running();
  const s = stop();
  renderBar();
  if (!s) { after(); return; }
  const task = s.taskId && getData().tasks.find(t => t.id === s.taskId);
  const diff = s.planned ? s.minutes - s.planned : null;
  openSheet({
    title: 'Session enregistrée',
    saveLabel: task && !task.done ? 'Oui, tâche terminée' : 'OK',
    body: `
      <p class="session-sum"><b class="mono">${fmtMin(s.minutes)}</b>${s.planned ? ` <span class="muted">sur ${fmtMin(s.planned)} prévues
        (${diff > 0 ? '+' : ''}${diff} min)</span>` : ''}</p>
      ${task && !task.done ? `<p>As-tu terminé « ${esc(task.title)} » ?</p>` : ''}`,
    onSave: () => {
      if (task && !task.done) update(d => { const t = d.tasks.find(x => x.id === task.id); t.done = true; t.doneAt = new Date().toISOString(); });
      after();
    },
  });
  if (c) after();
}

function manualSheet(after) {
  const subjects = getData().planning.subjects;
  openSheet({
    title: 'Session oubliée',
    saveLabel: 'Ajouter',
    body: `
      <label>Matière <select name="subject"><option value="">Autre</option>${subjects.map(s => `<option value="${s.id}">${esc(s.short)}</option>`).join('')}</select></label>
      <label>Ce que tu as fait <input name="label" maxlength="60"></label>
      <div class="grid2">
        <label>Début <input type="time" name="start" value="14:00"></label>
        <label>Fin <input type="time" name="end" value="16:00"></label>
      </div>
      <label>Jour <input type="date" name="date" value="${dateKey()}"></label>`,
    onSave: f => {
      if (!f.get('start') || !f.get('end') || f.get('end') <= f.get('start')) return 'La fin doit être après le début.';
      addManual({ date: f.get('date') || dateKey(), start: f.get('start'), end: f.get('end'), subject: f.get('subject'), label: f.get('label').trim() });
      after();
    },
  });
}

/* ---------- Barre flottante ---------- */

export function renderBar() {
  let bar = document.getElementById('chrono-bar');
  const c = running();
  const onPage = location.hash.startsWith('#chrono');
  if (!c || onPage) { bar?.remove(); document.body.classList.remove('has-chrono'); return; }
  if (!bar) {
    bar = document.createElement('a');
    bar.id = 'chrono-bar';
    bar.href = '#chrono';
    document.body.appendChild(bar);
  }
  const sub = subjectOf(c.subject);
  document.body.classList.add('has-chrono');
  bar.className = c.paused ? 'paused' : '';
  bar.innerHTML = `
    <i style="background:${sub?.color || 'var(--accent)'}"></i>
    <span class="cb-label">${esc(c.label || sub?.short || 'Chrono')}</span>
    <b class="mono" data-chrono-time>${fmtClock(elapsedMs(c))}</b>`;
}

// Mise à jour chaque seconde des affichages du chrono.
export function tick() {
  const c = running();
  if (!c) return;
  const ms = elapsedMs(c);
  document.querySelectorAll('[data-chrono-time]').forEach(x => { x.textContent = fmtClock(ms); });
  document.querySelectorAll('[data-chrono-ring]').forEach(x => { x.style.strokeDashoffset = ringOffset(c, ms); });
}
