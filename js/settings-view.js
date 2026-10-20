// Page Réglages : apparence, objectifs des essentiels, puis les réglages du planning et des données.

import { getData, update } from './storage.js';
import { esc } from './util.js';
import { DIRECTIONS, MODES, currentTheme, setTheme } from './theme.js';
import { openSheet } from './sheet.js';
import { renderSettings as renderPlanningSettings } from './planning-view.js';

export function render(el) {
  const t = currentTheme();
  const e = getData().essentials;
  el.innerHTML = `
    <h2 class="section-title">Apparence</h2>
    <div class="themes">
      ${Object.entries(DIRECTIONS).map(([k, d]) => `
        <button class="theme-card ${t.dir === k ? 'on' : ''}" data-dir="${k}" style="--sw:${d.accent};--sb:${d.dark}">
          <span class="theme-sw"><i></i></span>
          <b>${d.label}</b>
        </button>`).join('')}
    </div>
    <div class="segmented three" style="margin-top:10px">
      ${Object.entries(MODES).map(([k, l]) => `<button class="${t.mode === k ? 'on' : ''}" data-mode="${k}">${l}</button>`).join('')}
    </div>
    <p class="small muted note">Ce choix devient ton thème par défaut.</p>

    <h2 class="section-title">Objectifs des essentiels</h2>
    <button class="card row-link" data-goals style="width:100%;border:none;font:inherit;color:inherit;text-align:left">
      <span class="grow"><span class="name">Calories, pas, salle, travail</span>
        <span class="muted small">${e.kcalMin}–${e.kcalMax} kcal · ${e.steps} pas · salle ${e.gymPerWeek}× / sem. · travail ${e.workGoal.bibliotheque / 60} h biblio, ${e.workGoal.cours / 60} h cours</span></span>
      <span class="chev-txt">›</span>
    </button>
    <h2 class="section-title">Révisions</h2>
    <a class="card row-link" href="#examens/profil"><span class="grow"><span class="name">Profil de révision</span>
      <span class="muted small">Méthodes, délais avant les épreuves, durée des sessions</span></span><span class="chev-txt">›</span></a>
    <div id="planning-settings"></div>`;

  renderPlanningSettings(el.querySelector('#planning-settings'), { embedded: true });

  el.onclick = ev => {
    const d = ev.target.closest('[data-dir]');
    const m = ev.target.closest('[data-mode]');
    if (d) { setTheme({ dir: d.dataset.dir }); render(el); }
    else if (m) { setTheme({ mode: m.dataset.mode }); render(el); }
    else if (ev.target.closest('[data-goals]')) editGoals(el);
  };
  return 'Réglages';
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
      </div>
      <p class="small muted">Heures de travail visées (chrono), selon le type de jour :</p>
      <div class="grid2">
        <label>Bibliothèque (h) <input name="wB" inputmode="decimal" value="${String(e.workGoal.bibliotheque / 60).replace('.', ',')}"></label>
        <label>Cours (h) <input name="wC" inputmode="decimal" value="${String(e.workGoal.cours / 60).replace('.', ',')}"></label>
        <label>Repos (h) <input name="wR" inputmode="decimal" value="${String(e.workGoal.repos / 60).replace('.', ',')}"></label>
      </div>`,
    onSave: f => {
      const n = k => parseInt(f.get(k), 10);
      const h = k => Math.round(parseFloat(String(f.get(k)).replace(',', '.')) * 60);
      const next = { ...e, kcalMin: n('kcalMin'), kcalMax: n('kcalMax'), steps: n('steps'), gymPerWeek: n('gymPerWeek'),
        workGoal: { bibliotheque: h('wB'), cours: h('wC'), repos: h('wR') } };
      if (Object.values(next.workGoal).some(v => isNaN(v) || v < 0)) return 'Vérifie les heures de travail.';
      if (['kcalMin', 'kcalMax', 'steps', 'gymPerWeek'].some(k => isNaN(next[k]) || next[k] < 0)) return 'Vérifie les nombres.';
      if (next.kcalMin > next.kcalMax) return 'Le minimum de calories dépasse le maximum.';
      update(d => { d.essentials = next; });
      render(el);
    },
  });
}
