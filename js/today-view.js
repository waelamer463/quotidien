// Onglet « Aujourd'hui » : ce qui se passe maintenant, les essentiels, la to-do du jour.

import { getData, update } from './storage.js';
import { dateKey, addDays, dayLabel, parseKey, fmt, esc } from './util.js';
import { icon } from './icons.js';
import { PRAYERS, PRAYER_NAMES } from './prayers.js';
import { buildDay, toHHMM } from './planning-model.js';
import { PRAYER_STATES, dayLog, setLog, cyclePrayer, gymWeek, kcalState } from './essentials.js';
import { SHORTCUT_URL, parse, apply } from './health-import.js';
import { openSheet } from './sheet.js';

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
    <div class="daynav">
      <button class="icon-btn" data-act="prev" aria-label="Jour précédent">${icon('left')}</button>
      <strong>${dayLabel(day)}</strong>
      <button class="icon-btn" data-act="next" aria-label="Jour suivant" ${day === today ? 'disabled' : ''}>${icon('right')}</button>
    </div>

    ${day === today ? nowCard(built.items) : ''}

    <div class="ess-head">
      <h2 class="section-title">Essentiels</h2>
      <button class="link small" data-act="settings">Objectifs</button>
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

    <div class="metrics">
      ${metric('kcal', 'Calories', l.kcal, `${fmt(e.kcalMin)}–${fmt(e.kcalMax)}`, kcalState(l.kcal, e),
        Math.min(100, ((l.kcal || 0) / e.kcalMax) * 100), 'kcal')}
      ${metric('pas', 'Pas', l.pas, `≥ ${fmt(e.steps)}`, (l.pas || 0) >= e.steps ? 'done' : 'todo',
        Math.min(100, ((l.pas || 0) / e.steps) * 100), 'pas')}
    </div>
    ${day === today ? `
      <div class="health-row">
        <a class="btn small secondary" href="${SHORTCUT_URL}">${icon('heart')}Lire Santé</a>
        <button class="btn small secondary" data-act="paste">${icon('paste')}Coller</button>
      </div>
      ${importMsg ? `<p class="small muted import-msg">${esc(importMsg)}</p>` : ''}` : ''}

    <div class="card gym ${l.salle ? 'done' : ''}">
      <div class="gym-top">
        <span><span class="name">Salle</span>
          <span class="muted small">${gym.count} / ${e.gymPerWeek} cette semaine${gym.count >= e.gymPerWeek ? ', objectif atteint' : ''}</span></span>
        <button class="gym-btn" data-act="gym" aria-pressed="${Boolean(l.salle)}">${icon('check')}<span>${l.salle ? 'Faite' : 'J\'y suis allé'}</span></button>
      </div>
      <div class="gym-week">
        ${gym.days.map(g => `<span class="${g.done ? 'on' : ''} ${g.key === day ? 'cur' : ''}">${'DLMMJVS'[parseKey(g.key).getDay()]}</span>`).join('')}
      </div>
    </div>

    <div class="ess-head">
      <h2 class="section-title">To-do</h2>
      <a class="link small" href="#planning">Planning</a>
    </div>
    <div class="card">
      <p class="muted small">${todo.length ? `${todo.filter(t => t.done).length} / ${todo.length} tâches faites aujourd'hui.` : 'Aucune tâche pour ce jour.'}
        La nouvelle to-do arrive à l'étape R2.</p>
    </div>`;

  el.onclick = async ev => {
    const b = ev.target.closest('[data-act],[data-prayer],[data-metric]');
    if (!b) return;
    const a = b.dataset.act;
    if (a === 'prev') day = addDays(day, -1);
    else if (a === 'next') day = addDays(day, 1);
    else if (b.dataset.prayer) cyclePrayer(day, b.dataset.prayer, b.dataset.late === '1');
    else if (a === 'gym') setLog(day, x => { if (x.salle) delete x.salle; else x.salle = true; });
    else if (b.dataset.metric) return editMetric(el, b.dataset.metric);
    else if (a === 'settings') return editGoals(el);
    else if (a === 'paste') {
      try { runImport(await navigator.clipboard.readText()); } catch { return manualPaste(el); }
    }
    render(el);
  };
  return day === today ? 'Aujourd\'hui' : dayLabel(day);
}

function metric(key, label, value, goal, state, pct, unit) {
  return `
    <button class="card metric ${state}" data-metric="${key}">
      <span class="m-top"><span class="name">${label}</span><span class="muted small">${goal}</span></span>
      <span class="m-val">${value ? fmt(value) : '—'} <small>${unit}</small></span>
      <span class="bar"><i style="width:${pct}%"></i></span>
      <span class="m-hint">${state === 'over' ? 'Au-dessus de la limite' : state === 'done' ? 'Objectif atteint' : 'Toucher pour saisir'}</span>
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
