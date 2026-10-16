import { getData } from './storage.js';
import { dateKey, addDays, parseKey, esc } from './util.js';
import { goalLabel } from './habits-model.js';
import { currentStreak, dayResult } from './stats.js';
import { icon } from './icons.js';
import { overviewTiles, globalCalendar, habitTiles, habitCalendar, habitChart, bindCharts } from './stats-ui.js';

let month = dateKey().slice(0, 7); // mois affiché dans les calendriers

// #stats = bilan + liste, #stats/<id> = fiche d'une habitude
export function render(el, [id]) {
  const { habits, entries } = getData();
  bindOnce(el);

  if (!habits.length) {
    el.innerHTML = `
      <div class="card">
        <h2>Pas encore de statistiques</h2>
        <p class="muted">Crée tes habitudes et remplis-les : tes séries et graphiques apparaîtront ici.</p>
      </div>
      <a class="btn" href="#habitudes">Aller aux habitudes</a>`;
    return;
  }

  const h = id && habits.find(x => x.id === id);
  if (h) {
    el.innerHTML = `
      <a class="back" href="#stats">${icon('left')}Retour</a>
      <p class="muted" style="margin:0 0 14px">${goalLabel(h) || 'Oui / Non'}</p>
      ${habitTiles(h, entries)}
      ${h.type === 'check' ? '' : `<div class="section-title">30 derniers jours</div>${habitChart(h, entries)}`}
      <div class="section-title">Calendrier</div>
      ${monthNav()}
      ${habitCalendar(h, entries, month)}`;
    return h.name;
  }

  el.innerHTML = `
    <div class="section-title">Bilan</div>
    ${overviewTiles(habits, entries)}
    ${monthNav()}
    ${globalCalendar(habits, entries, month)}
    <div class="section-title">Par habitude</div>
    ${habits.map(h => `
      <a class="card habit-row" href="#stats/${h.id}">
        <span class="grow"><span class="name">${esc(h.name)}</span>
          <span class="muted small">${goalLabel(h) || 'Oui / Non'}</span>${last14(h, entries)}</span>
        <span class="streak">${icon('flame')}${currentStreak(h, entries)} j<small>série</small></span>
        ${icon('right', 'chev')}
      </a>`).join('')}`;
}

function monthNav() {
  const cur = dateKey().slice(0, 7);
  return `<div class="daynav">
    <button class="icon-btn" data-month="-1" aria-label="Mois précédent">${icon('left')}</button>
    <strong>${monthName()}</strong>
    <button class="icon-btn" data-month="1" aria-label="Mois suivant" ${month >= cur ? 'disabled' : ''}>${icon('right')}</button>
  </div>`;
}

function monthName() {
  const t = parseKey(`${month}-01`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function last14(h, entries) {
  const today = dateKey();
  let s = '';
  for (let i = 13; i >= 0; i--) {
    const r = dayResult(h, entries, addDays(today, -i), today);
    s += `<i class="${r === 'pending' ? '' : r || ''}"></i>`;
  }
  return `<div class="dots" aria-hidden="true">${s}</div>`;
}

// Les écouteurs restent attachés au conteneur : on ne les pose qu'une fois.
let bound = false;
function bindOnce(el) {
  if (bound) return;
  bound = true;
  bindCharts(el);
  el.addEventListener('click', e => {
    const b = e.target.closest('[data-month]');
    if (!b) return;
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m - 1 + Number(b.dataset.month), 1);
    month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    render(el, location.hash.split('/').slice(1)); // sans remonter en haut de page
  });
}
