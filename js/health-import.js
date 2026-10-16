// Import des données envoyées par le raccourci iPhone "Quotidien".
// Le raccourci copie un texte de la forme :
//   QUOTIDIEN date=2026-10-16 pas=8 234 kcal=1 720,5
// (les nombres peuvent être au format français : espaces, virgule).

import { update, getData } from './storage.js';
import { dateKey, fmt } from './util.js';

export const SHORTCUT_NAME = 'Quotidien';
export const SHORTCUT_URL = `shortcuts://run-shortcut?name=${encodeURIComponent(SHORTCUT_NAME)}`;

export const SOURCES = {
  pas: 'Pas (Santé)',
  kcal: 'Calories (Santé / Yazio)',
};

export function parse(text) {
  if (!/^\s*QUOTIDIEN\b/i.test(text || '')) return null;
  const out = { date: dateKey(), values: {} };
  // clé=valeur jusqu'à la clé suivante (les valeurs peuvent contenir des espaces)
  const re = /(\w+)=([^=]*?)(?=\s+\w+=|$)/g;
  for (const [, key, raw] of text.trim().matchAll(re)) {
    if (key === 'date') {
      if (/^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) out.date = raw.trim();
    } else if (key in SOURCES) {
      const n = parseFloat(raw.replace(/[^\d,.-]/g, '').replace(',', '.'));
      if (!isNaN(n)) out.values[key] = Math.round(n);
    }
  }
  return out;
}

// Applique l'import aux habitudes reliées. Renvoie la liste des changements.
export function apply({ date, values }) {
  const changes = [];
  update(d => {
    d.entries[date] ??= {};
    for (const h of d.habits) {
      if (!h.source || !(h.source in values)) continue;
      const v = values[h.source];
      // une valeur à 0 ne décoche jamais une case cochée à la main
      if (h.type === 'check' && !v) continue;
      d.entries[date][h.id] = h.type === 'check' ? 1 : v;
      changes.push(h.type === 'check' ? `${h.name} ✓` : `${h.name} ${fmt(v)} ${h.unit || ''}`.trim());
    }
  });
  return changes;
}

export function hasLinkedHabits() {
  return getData().habits.some(h => h.source);
}
