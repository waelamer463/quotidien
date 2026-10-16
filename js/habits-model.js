// Logique des habitudes, sans affichage : réutilisée par les statistiques (étape 3)
// et par le planning (étape 6).
//
// Une habitude :
// { id, name, type: 'check'|'min'|'max'|'range', unit, min, max, step,
//   days: [0..6] (0 = dimanche), start: 'AAAA-MM-JJ'|null, end: 'AAAA-MM-JJ'|null, created,
//   source: 'pas'|'kcal'|'salle'|null (import depuis le raccourci iPhone) }

import { parseKey, fmt } from './util.js';

export const TYPES = {
  check: 'Oui / Non',
  min: 'Au moins',
  max: 'Au plus',
  range: 'Entre',
};

// Lundi en premier, valeurs = numéro JS du jour.
export const WEEK = [
  [1, 'L'], [2, 'M'], [3, 'M'], [4, 'J'], [5, 'V'], [6, 'S'], [0, 'D'],
];

export const PRESETS = {
  calories: { name: 'Calories', type: 'range', unit: 'kcal', min: 1600, max: 1900, step: 100, source: 'kcal' },
  pas: { name: 'Marche', type: 'min', unit: 'pas', min: 7000, step: 500, source: 'pas' },
  travail: { name: 'Travail', type: 'min', unit: 'h', min: 6, step: 0.5 },
  salle: { name: 'Salle de sport', type: 'check', source: 'salle' },
};

export function isScheduled(h, key) {
  if (key < (h.start || h.created)) return false;
  if (h.end && key > h.end) return false;
  return h.days.includes(parseKey(key).getDay());
}

// 'done' = objectif atteint, 'todo' = pas encore, 'over' = limite dépassée
export function status(h, value = 0) {
  switch (h.type) {
    case 'check': return value ? 'done' : 'todo';
    case 'min': return value >= h.min ? 'done' : 'todo';
    case 'max': return value <= h.max ? 'done' : 'over';
    case 'range': return value > h.max ? 'over' : value >= h.min ? 'done' : 'todo';
  }
}

export function goalLabel(h) {
  const u = h.unit ? ` ${h.unit}` : '';
  switch (h.type) {
    case 'check': return '';
    case 'min': return `≥ ${fmt(h.min)}${u}`;
    case 'max': return `≤ ${fmt(h.max)}${u}`;
    case 'range': return `${fmt(h.min)} – ${fmt(h.max)}${u}`;
  }
}

export function daysLabel(h) {
  if (h.days.length === 7) return 'Tous les jours';
  const names = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];
  return WEEK.filter(([d]) => h.days.includes(d)).map(([d]) => names[d]).join(', ');
}

// Remplissage de la barre de progression, entre 0 et 100.
export function progress(h, value = 0) {
  const ref = h.type === 'min' ? h.min : h.max;
  if (h.type === 'check') return value ? 100 : 0;
  return ref > 0 ? Math.min(100, (value / ref) * 100) : 0;
}
