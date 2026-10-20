// Panneau qui monte du bas de l'écran, avec un formulaire.
// onSave(FormData) peut renvoyer un message d'erreur (chaîne) pour garder le panneau ouvert.

import { esc } from './util.js';
import { icon } from './icons.js';
import { KINDS } from './planning-model.js';

export function openSheet({ title, body, onSave, onDelete, saveLabel = 'Enregistrer', extra = null }) {
  const wrap = document.createElement('div');
  wrap.className = 'sheet-backdrop';
  wrap.innerHTML = `
    <form class="sheet form" novalidate>
      <div class="sheet-head">
        <strong>${esc(title)}</strong>
        <button type="button" class="icon-btn" data-close aria-label="Fermer">${icon('close')}</button>
      </div>
      ${body}
      <p class="error" hidden></p>
      <button class="btn" type="submit">${saveLabel}</button>
      ${extra ? `<button class="btn secondary" type="button" data-extra>${extra.label}</button>` : ''}
      ${onDelete ? '<button class="btn danger" type="button" data-delete>Supprimer</button>' : ''}
    </form>`;
  document.body.appendChild(wrap);
  document.body.classList.add('no-scroll');

  const form = wrap.querySelector('form');
  // iPhone : garde le champ touché visible au-dessus du clavier
  form.addEventListener('focusin', e => {
    if (e.target.matches('input, select, textarea')) setTimeout(() => e.target.scrollIntoView({ block: 'center', behavior: 'smooth' }), 320);
  });
  const close = () => { wrap.remove(); document.body.classList.remove('no-scroll'); };

  wrap.addEventListener('click', e => {
    if (e.target === wrap || e.target.closest('[data-close]')) close();
    if (e.target.closest('[data-delete]')) { onDelete(); close(); }
    if (e.target.closest('[data-extra]')) { close(); extra.onClick(); }
  });
  form.addEventListener('submit', e => {
    e.preventDefault();
    const problem = onSave(new FormData(form));
    if (problem) {
      const err = form.querySelector('.error');
      err.textContent = problem;
      err.hidden = false;
    } else close();
  });
  return form;
}

// Champs d'une activité (nom, horaires, type, à l'extérieur).
export function activityFields(a = {}) {
  return `
    <label>Nom <input name="label" maxlength="50" value="${esc(a.label || '')}" placeholder="Ex. Salle de sport"></label>
    <div class="grid2">
      <label>Début <input type="time" name="start" value="${a.start || '09:00'}"></label>
      <label>Fin <input type="time" name="end" value="${a.end || '10:00'}"></label>
    </div>
    <label>Type
      <select name="kind">
        ${Object.entries(KINDS).map(([k, l]) => `<option value="${k}" ${a.kind === k ? 'selected' : ''}>${l}</option>`).join('')}
      </select>
    </label>
    <label class="switch">
      <input type="checkbox" name="away" ${a.away ? 'checked' : ''}>
      <span>Je suis dehors (prières rattrapées au retour)</span>
    </label>`;
}

// Lit et vérifie le formulaire d'activité. Renvoie [activité, erreur].
export function readActivity(f, previous = {}) {
  const a = {
    ...previous,
    label: f.get('label').trim(),
    start: f.get('start'),
    end: f.get('end'),
    kind: f.get('kind'),
    away: f.get('away') === 'on',
  };
  if (!a.away) delete a.away;
  if (!a.label) return [null, 'Donne un nom à l\'activité.'];
  if (!a.start || !a.end) return [null, 'Indique le début et la fin.'];
  if (a.end <= a.start) return [null, 'La fin doit être après le début.'];
  return [a, ''];
}
