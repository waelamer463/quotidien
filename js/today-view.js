// Onglet « Aujourd'hui » : ce qui se passe maintenant, les essentiels, la to-do du jour.

import { getData, update } from './storage.js';
import { dateKey, addDays, dayLabel, parseKey, fmt, esc } from './util.js';
import { icon } from './icons.js';
import { PRAYERS, PRAYER_NAMES } from './prayers.js';
import { buildDay, toHHMM } from './planning-model.js';
import { PRAYER_STATES, dayLog, setLog, cyclePrayer, gymWeek, kcalState, workGoal, sleepMinutes } from './essentials.js';
import { minutesOn, fmtMin } from './chrono.js';
import { upcoming, daysUntil } from './exams-model.js';
import { examCard } from './exams-view.js';
import { homeCard } from './review-view.js';
import { stripHTML } from './mascot.js';
import { SHORTCUT_URL, parse, apply } from './health-import.js';
import { openSheet } from './sheet.js';
import { todoSection, handleTodoClick, bindQuick, taskBlocks } from './todo-view.js';
import { findConflicts } from './conflicts.js';

let day = dateKey();
let importMsg = '';

export function render(el) {
  const today = dateKey();
  if (day > today) day = today;
  const { essentials: e, planning: p, tasks } = getData();
  const l = dayLog(day);
  const built = buildDay(p, day);
  const plannedLate = Object.fromEntries(built.items.filter(i => i.prayer).map(i => [i.prayer, i.deferred]));
  const prayed = PRAYERS.filter(n => l.prayers?.[n] && l.prayers[n] !== 'manquee').length;
  const gym = gymWeek(day);
  const todo = tasks.filter(t => t.date === day);

  el.innerHTML = `
    ${day === today ? `
    <div class="daynav compact">
      <button class="day-back" data-act="prev" aria-label="Voir hier">${icon('left')}Hier</button>
    </div>` : `
    <div class="daynav">
      <button class="icon-btn" data-act="prev" aria-label="Jour précédent">${icon('left')}</button>
      <button class="link small" data-act="today">Revenir à aujourd'hui</button>
      <button class="icon-btn" data-act="next" aria-label="Jour suivant">${icon('right')}</button>
    </div>`}

    ${day === today ? stripHTML() : ''}
    ${day === today ? nowCard(built.items) : ''}
    ${day === today ? upcoming().filter(x => daysUntil(x.date) <= 60).slice(0, 2).map(x => examCard(x, true)).join('') : ''}
    ${day === today ? homeCard(today) : ''}
    ${conflictNote(built.items)}

    <div class="ess-head">
      <h2 class="section-title">Essentiels</h2>
      <a class="link small" href="#reglages">Objectifs</a>
    </div>

    <div class="card prayers-card">
      <div class="prayers-top"><span class="name">Prières</span><span class="muted small">${prayed} / 5</span></div>
      <div class="prayers">
        ${PRAYERS.map(n => {
          const st = l.prayers?.[n];
          const t = built.prayers[n];
          return `
          <button class="prayer ${st || ''}" data-prayer="${n}" data-late="${plannedLate[n] ? 1 : 0}">
            <span class="p-dot">${st === 'heure' ? icon('check') : st === 'rattrapee' ? icon('sync') : st === 'manquee' ? icon('close') : ''}</span>
            <b>${PRAYER_NAMES[n]}</b>
            <small>${st ? PRAYER_STATES[st] : plannedLate[n] ? 'à rattraper' : toHHMM(t)}</small>
          </button>`;
        }).join('')}
      </div>
    </div>

    <div class="rings four">
      ${ring('work', fmtMin(minutesOn(day)), 'Travail', workGoal(day) ? `objectif ${fmtMin(workGoal(day))}` : 'jour de repos',
        workGoal(day) && minutesOn(day) >= workGoal(day) ? 'done' : 'todo', workGoal(day) ? minutesOn(day) / workGoal(day) : 0)}
      ${ring('kcal', fmtK(l.kcal), 'Calories', `${fmt(e.kcalMin)}–${fmt(e.kcalMax)}`, kcalState(l.kcal, e), (l.kcal || 0) / e.kcalMax)}
      ${ring('pas', fmtK(l.pas), 'Pas', `≥ ${fmt(e.steps)}`, (l.pas || 0) >= e.steps ? 'done' : 'todo', (l.pas || 0) / e.steps)}
      ${ring('gym', l.salle ? null : `${gym.count}/${e.gymPerWeek}`, 'Salle',
        l.salle ? 'faite aujourd\'hui' : 'touche pour cocher', gym.count >= e.gymPerWeek || l.salle ? 'done' : 'todo',
        gym.count / e.gymPerWeek)}
    </div>
    ${sleepCard(l, e)}
    <div class="card mini-card">
      <div class="mini-head"><span>Salle cette semaine</span><b class="mono">${gym.count}/${e.gymPerWeek}</b></div>
      <div class="gym-week">
        ${gym.days.map(g => `<span class="${g.done ? 'on' : ''} ${g.key === day ? 'cur' : ''}">${'DLMMJVS'[parseKey(g.key).getDay()]}</span>`).join('')}
      </div>
    </div>
    ${day === today ? `
      <div class="card mini-card">
        <div class="mini-head"><span>Pas et calories depuis Santé</span></div>
        <div class="health-row">
          <a class="btn small secondary" href="${SHORTCUT_URL}">${icon('heart')}Lire Santé</a>
          <button class="btn small secondary" data-act="paste">${icon('paste')}<span>Coller</span></button>
        </div>
        ${importMsg ? `<p class="small muted import-msg">${esc(importMsg)}</p>` : ''}
      </div>` : ''}

    <div class="ess-head">
      <h2 class="section-title">To-do</h2>
      <span class="muted small">${todo.length ? `${todo.filter(t => t.done).length} / ${todo.length} faites` : ''}</span>
    </div>
    ${todoSection(day)}`;
  bindQuick(el, day, () => render(el));
  requestAnimationFrame(() => requestAnimationFrame(() => el.querySelectorAll('.ring .v').forEach(v => {
    v.style.strokeDashoffset = v.dataset.off;
    lastOff[v.closest('.ring').dataset.metric] = v.dataset.off;
  })));

  el.onclick = async ev => {
    if (handleTodoClick(ev, day, () => render(el))) return;
    const b = ev.target.closest('[data-act],[data-prayer],[data-metric]');
    if (b?.dataset.metric === 'work') { location.hash = '#chrono'; return; }
    if (b?.dataset.metric === 'sleep') return editSleep(el);
    if (b?.dataset.metric === 'gym') { setLog(day, x => { if (x.salle) delete x.salle; else x.salle = true; }); return render(el); }
    if (!b) return;
    const a = b.dataset.act;
    if (a === 'prev') day = addDays(day, -1);
    else if (a === 'next') day = addDays(day, 1);
    else if (a === 'today') day = today;
    else if (b.dataset.prayer) cyclePrayer(day, b.dataset.prayer, b.dataset.late === '1');
    else if (a === 'gym') setLog(day, x => { if (x.salle) delete x.salle; else x.salle = true; });
    else if (b.dataset.metric) return editMetric(el, b.dataset.metric);
    else if (a === 'settings') return editGoals(el);
    else if (a === 'paste') {
      b.classList.add('busy'); b.lastChild.textContent = 'Lecture…';
      try { runImport(await navigator.clipboard.readText()); } catch { b.classList.remove('busy'); b.lastChild.textContent = 'Coller'; return manualPaste(el); }
    }
    render(el);
  };
  return day === today ? 'Aujourd\'hui' : dayLabel(day);
}

function conflictNote(items) {
  const n = findConflicts([...items, ...taskBlocks(day)], getData().planning.days[day]?.okConflicts || []).length;
  return n ? `<a class="card banner warn row-link" href="#planning/jour/${day}">
    <span class="grow"><strong>${n} chevauchement${n > 1 ? 's' : ''} dans ton planning</strong>
      <span class="small muted">Touche pour voir les solutions proposées.</span></span>${icon('right', 'chev')}</a>` : '';
}

function sleepCard(l, e) {
  const m = sleepMinutes(l);
  return `
    <button class="card sleep-card ${m !== null && m >= e.sleepGoal ? 'ok' : ''}" data-metric="sleep">
      <svg class="ic" viewBox="0 0 24 24"><path d="M19.5 14.8A7.5 7.5 0 019.2 4.5a7.5 7.5 0 1010.3 10.3z"/></svg>
      <span class="grow"><b>Sommeil</b>
        <span class="small muted">${m === null ? 'Touche pour saisir ton coucher et ton lever' : `${l.sleep.bed} → ${l.sleep.wake} · objectif ${fmtMin(e.sleepGoal)}`}</span></span>
      <span class="mono sleep-val">${m === null ? '—' : fmtMin(m)}</span>
    </button>`;
}

function editSleep(el) {
  const l = dayLog(day);
  const goal = getData().essentials.sleepGoal;
  openSheet({
    title: 'Sommeil',
    body: `
      <p class="small muted">La nuit qui précède cette journée.</p>
      <div class="grid2">
        <label>Couché à <input type="time" name="bed" value="${l.sleep?.bed || '23:00'}"></label>
        <label>Levé à <input type="time" name="wake" value="${l.sleep?.wake || '06:30'}"></label>
      </div>
      <label>Objectif de sommeil (heures) <input name="goal" inputmode="decimal" value="${String(goal / 60).replace('.', ',')}"></label>`,
    onSave: f => {
      if (!f.get('bed') || !f.get('wake')) return 'Indique les deux heures.';
      const g = parseFloat(String(f.get('goal')).replace(',', '.'));
      setLog(day, x => { x.sleep = { bed: f.get('bed'), wake: f.get('wake') }; });
      if (!isNaN(g) && g > 0) update(d => { d.essentials.sleepGoal = Math.round(g * 60); });
      render(el);
    },
  });
}

// Dernière position de chaque anneau : l'anneau s'anime de l'ancienne valeur vers la nouvelle.
const lastOff = {};

const fmtK = v => (!v ? '—' : v >= 10000 ? `${(v / 1000).toFixed(1).replace('.', ',')}k` : fmt(v));

// Anneau d'un essentiel. value = texte au centre (null : coche).
function ring(key, value, label, sub, state, ratio) {
  const C = 2 * Math.PI * 32;
  const off = C * (1 - Math.max(0, Math.min(1, ratio || 0)));
  return `
    <button class="ring ${state}" data-metric="${key}" aria-label="${label} : ${value ?? 'faite'}">
      <span class="ring-dial">
        <svg viewBox="0 0 76 76"><circle class="t" cx="38" cy="38" r="32"/>
          <circle class="v" cx="38" cy="38" r="32" data-off="${off}" style="stroke-dasharray:${C};stroke-dashoffset:${lastOff[key] ?? C}"/></svg>
        <span class="ring-val ${value === null ? 'ok-ic' : ''}">${value === null ? icon('check') : value}</span>
      </span>
      <b>${label}</b>
      <small>${state === 'over' ? 'au-dessus de la limite' : sub}</small>
    </button>`;
}

function nowCard(items) {
  const now = new Date();
  const t = now.getHours() * 60 + now.getMinutes();
  const list = items.filter(i => i.kind !== 'sommeil' && !(i.prayer && i.deferred));
  const cur = list.find(i => !i.prayer && i.start <= t && t < i.end);
  const next = list.filter(i => i.start > t).slice(0, 2);
  if (!cur && !next.length) return '';
  const line = (i, tag) => `
    <div class="now-row">
      <span class="tl-time">${toHHMM(i.start)}</span>
      <span><span class="now-tag">${tag}</span><b> ${esc(i.label)}</b>
        ${tag === 'Maintenant' ? `<small>jusqu'à ${toHHMM(i.end)}</small>` : ''}</span>
    </div>`;
  return `
    <a class="card now-card row-link" href="#planning">
      <span class="grow">${cur ? line(cur, 'Maintenant') : ''}${next.map(i => line(i, 'Ensuite')).join('')}</span>
      ${icon('right', 'chev')}
    </a>`;
}

function editMetric(el, key) {
  const cur = dayLog(day)[key] || 0;
  const unit = key === 'kcal' ? 'kcal' : 'pas';
  openSheet({
    title: key === 'kcal' ? 'Calories' : 'Pas',
    saveLabel: 'Enregistrer',
    body: `
      <p class="muted">Actuellement : <b>${fmt(cur)} ${unit}</b></p>
      <div class="segmented">
        <label><input type="radio" name="mode" value="add" checked><span>Ajouter</span></label>
        <label><input type="radio" name="mode" value="set"><span>Remplacer</span></label>
      </div>
      <label>Quantité (${unit}) <input name="n" inputmode="numeric" placeholder="${key === 'kcal' ? 'Ex. 650' : 'Ex. 3000'}" autofocus></label>`,
    onSave: f => {
      const n = parseFloat(String(f.get('n')).replace(/\s/g, '').replace(',', '.'));
      if (isNaN(n)) return 'Indique un nombre.';
      setLog(day, l => { l[key] = Math.max(0, Math.round(f.get('mode') === 'add' ? (l[key] || 0) + n : n)); });
      render(el);
    },
  });
}

function editGoals(el) {
  const e = getData().essentials;
  openSheet({
    title: 'Objectifs',
    body: `
      <div class="grid2">
        <label>Calories min <input name="kcalMin" inputmode="numeric" value="${e.kcalMin}"></label>
        <label>Calories max <input name="kcalMax" inputmode="numeric" value="${e.kcalMax}"></label>
        <label>Pas minimum <input name="steps" inputmode="numeric" value="${e.steps}"></label>
        <label>Salle par semaine <input name="gymPerWeek" inputmode="numeric" value="${e.gymPerWeek}"></label>
      </div>`,
    onSave: f => {
      const n = k => parseInt(f.get(k), 10);
      const next = { kcalMin: n('kcalMin'), kcalMax: n('kcalMax'), steps: n('steps'), gymPerWeek: n('gymPerWeek') };
      if (Object.values(next).some(v => isNaN(v) || v < 0)) return 'Vérifie les nombres.';
      if (next.kcalMin > next.kcalMax) return 'Le minimum de calories dépasse le maximum.';
      update(d => { d.essentials = next; });
      render(el);
    },
  });
}

function runImport(text) {
  const data = parse(text);
  if (!data) { importMsg = 'Rien à importer : touche d\'abord « Lire Santé », puis reviens ici.'; return; }
  const changes = apply(data);
  importMsg = changes.length ? `Importé${data.date === dateKey() ? '' : ` pour le ${data.date}`} : ${changes.join(', ')}` : 'Aucune valeur reçue.';
}

function manualPaste(el) {
  openSheet({
    title: 'Coller les données Santé',
    saveLabel: 'Importer',
    body: '<textarea name="txt" rows="3" placeholder="Appuie longuement ici puis « Coller »"></textarea>',
    onSave: f => { runImport(f.get('txt')); render(el); },
  });
}
