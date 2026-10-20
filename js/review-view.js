// Page « Bilan de la semaine » (#bilan, #bilan/<lundi>) et carte d'objectif sur l'accueil.

import { getData } from './storage.js';
import { dateKey, addDays, parseKey, esc, fmt } from './util.js';
import { icon } from './icons.js';
import { fmtMin } from './chrono.js';
import { examName } from './exams-model.js';
import { measure, reviewWeek, suggestGoal, setGoal, goalOf, goalProgress, examsSnapshot, GOAL_KINDS } from './weekly.js';
import { weekStart } from './essentials.js';

const dm = k => parseKey(k).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
const pct = (a, b) => (b ? Math.round(a / b * 100) : 0);

export function render(el, [arg]) {
  const today = dateKey();
  const mon = arg || reviewWeek(today);
  const next = addDays(mon, 7);
  const m = measure(mon, today);
  const prev = measure(addDays(mon, -7), today);
  const e = getData().essentials;
  const subjects = getData().planning.subjects;
  const bySubj = {};
  for (const [id, v] of Object.entries(m.bySubject)) { const k = subjects.some(s => s.id === id) ? id : 'autre'; bySubj[k] = (bySubj[k] || 0) + v; }
  const subjRows = Object.entries(bySubj).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const maxSubj = Math.max(1, ...subjRows.map(([, v]) => v));
  const oldGoal = goalOf(mon);
  const oldProg = goalProgress(oldGoal, mon, today);
  const goal = goalOf(next);
  const sug = goal || suggestGoal(m);
  const delta = (a, b, f) => (a === null || b === null || a === b ? '' : `<span class="trend ${a > b ? 'up' : 'down'}">${a > b ? '▲' : '▼'} ${f(Math.abs(a - b))}</span>`);

  el.innerHTML = `
    <div class="daynav">
      <a class="icon-btn" href="#bilan/${addDays(mon, -7)}" aria-label="Semaine précédente">${icon('left')}</a>
      <strong>Du ${dm(mon)} au ${dm(addDays(mon, 6))}</strong>
      ${next <= weekStart(today) ? `<a class="icon-btn" href="#bilan/${next}" aria-label="Semaine suivante">${icon('right')}</a>` : '<span class="icon-btn" aria-hidden="true"></span>'}
    </div>

    <div class="card review-hero">
      <span class="muted small">Score moyen</span>
      <div class="hero-score">${m.score === null ? '—' : Math.round(m.score)}<small>/100</small></div>
      <p class="small muted">${prev.score !== null && m.score !== null ? `${Math.round(prev.score)} la semaine d'avant ${delta(m.score, prev.score, v => Math.round(v))}` : 'Première semaine suivie.'}</p>
      ${oldGoal ? `<p class="goal-recap">${oldProg ? (oldProg.ratio >= 1 ? '✓ ' : '') : ''}Objectif de la semaine : <b>${esc(oldGoal.text)}</b>${oldProg
        ? ` · ${fmtGoal(oldGoal.kind, oldProg.cur)} sur ${fmtGoal(oldGoal.kind, oldGoal.value)} ${oldProg.ratio >= 1 ? '(réussi)' : `(${Math.round(oldProg.ratio * 100)} %)`}` : ''}</p>` : ''}
    </div>

    <h2 class="section-title">Essentiels</h2>
    <div class="card review-list">
      ${line('Prières à l\'heure', m.prayersN ? `${pct(m.prayersOk, m.prayersN)} %` : '—', `${m.prayersLate} rattrapée${m.prayersLate > 1 ? 's' : ''}`)}
      ${line('Calories dans la fourchette', `${m.kcalOk}/${m.days} j`)}
      ${line('Pas', m.pas === null ? '—' : fmt(Math.round(m.pas)), `${m.pasOk} j ≥ ${fmt(e.steps)}`)}
      ${line('Salle', `${m.salle}/${e.gymPerWeek}`, m.salle >= e.gymPerWeek ? 'objectif atteint' : '')}
      ${line('Sommeil moyen', m.sleep === null ? '—' : fmtMin(Math.round(m.sleep)))}
    </div>

    <h2 class="section-title">Travail</h2>
    <div class="card review-list">
      ${line('Heures (chrono)', fmtMin(m.work), m.workGoal ? `objectif ${fmtMin(m.workGoal)} · ${pct(m.work, m.workGoal)} %` : '')}
      ${m.plannedMin ? line('Tâches avec durée : faites / prévues', `${fmtMin(m.doneMin)} / ${fmtMin(m.plannedMin)}`, `${m.tasksDone}/${m.tasksN} tâches`) : ''}
      ${m.revN ? line('Séances de révision', `${m.revDone}/${m.revN}`, `${pct(m.revDone, m.revN)} %`) : ''}
      ${subjRows.length ? `<div class="review-subj">${subjRows.map(([id, v]) => {
        const s = subjects.find(x => x.id === id);
        return `<div class="rs-row"><span class="small">${esc(s?.short || 'Autre')}</span>
          <span class="rs-bar"><i style="width:${v / maxSubj * 100}%;background:${s?.color || 'var(--muted)'}"></i></span>
          <b class="mono small">${fmtMin(v)}${s?.weeklyGoal ? `<small>/${s.weeklyGoal}h</small>` : ''}</b></div>`;
      }).join('')}</div>` : '<p class="small muted">Aucune session de chrono cette semaine.</p>'}
    </div>

    ${examsSnapshot().length ? `<h2 class="section-title">Révisions</h2>
      <div class="card review-list">${examsSnapshot().map(({ exam, r }) =>
        line(esc(examName(exam)), `${Math.round(r * 100)} %`, `préparation · J-${Math.max(0, Math.round((parseKey(exam.date) - parseKey(today)) / 864e5))}`)).join('')}</div>` : ''}

    <h2 class="section-title">Objectif de la semaine prochaine</h2>
    <form class="card form goal-form">
      <p class="small muted">${goal ? 'Ton objectif pour la semaine du ' + dm(next) + '. Tu peux le changer.' : 'Proposé d\'après ta semaine : ton point le plus faible. Change-le si tu veux.'}</p>
      <label>Objectif <input name="text" maxlength="80" value="${esc(sug.text)}"></label>
      <div class="grid2">
        <label>Mesure <select name="kind">${Object.entries(GOAL_KINDS).map(([k, g]) => `<option value="${k}" ${sug.kind === k ? 'selected' : ''}>${g.label}</option>`).join('')}</select></label>
        <label>Cible <input name="value" inputmode="numeric" value="${sug.value ?? ''}"></label>
      </div>
      <p class="error" hidden></p>
      <button class="btn" type="submit">${goal ? 'Mettre à jour' : 'Fixer cet objectif'}</button>
    </form>`;

  el.querySelector('.goal-form').onsubmit = ev => {
    ev.preventDefault();
    const f = new FormData(ev.target);
    const kind = f.get('kind');
    const value = Number(String(f.get('value')).replace(',', '.'));
    const text = f.get('text').trim();
    const err = ev.target.querySelector('.error');
    if (!text) { err.textContent = 'Écris ton objectif.'; err.hidden = false; return; }
    if (kind !== 'libre' && !(value > 0)) { err.textContent = 'Donne une cible chiffrée (ou choisis « Objectif libre »).'; err.hidden = false; return; }
    setGoal(next, { text, kind, value: kind === 'libre' ? null : value });
    location.hash = '#aujourdhui';
  };
  return 'Bilan';
}

function line(label, value, sub = '') {
  return `<div class="trend-row"><span>${label}</span><b class="mono">${value}</b><span class="trend">${sub}</span></div>`;
}

export function fmtGoal(kind, v) {
  if (kind === 'travail') return fmtMin(Math.round(v * 60));
  if (kind === 'prieres') return `${Math.round(v)} %`;
  if (kind === 'pas') return fmt(Math.round(v));
  return String(Math.round(v));
}

// Carte d'accueil : bilan prêt (dimanche, lundi) et objectif de la semaine en cours.
export function homeCard(today = dateKey()) {
  const wd = parseKey(today).getDay();
  const mon = weekStart(today);
  const goal = goalOf(mon);
  const prog = goalProgress(goal, mon, today);
  const ready = wd === 0 ? !goalOf(addDays(mon, 7)) : wd === 1 && !goal;
  let html = '';
  if (ready) html += `
    <a class="card review-cta" href="#bilan">
      <span class="grow"><b>Ton bilan de la semaine est prêt</b>
        <span class="small muted">${wd === 0 ? 'Fais le point et fixe ton objectif pour la semaine prochaine.' : 'Tu n\'as pas encore d\'objectif cette semaine.'}</span></span>${icon('right', 'chev')}</a>`;
  if (goal) html += `
    <a class="card goal-card" href="#bilan">
      <span class="label">Objectif de la semaine</span>
      <b>${esc(goal.text)}</b>
      ${prog ? `<span class="bar"><i style="width:${prog.ratio * 100}%"></i></span>
        <span class="small muted">${fmtGoal(goal.kind, prog.cur)} sur ${fmtGoal(goal.kind, goal.value)}${prog.ratio >= 1 ? ' · atteint ✓' : ''}</span>` : ''}
    </a>`;
  return html;
}
