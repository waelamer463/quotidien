// Import des données envoyées par le raccourci iPhone "Quotidien".
// Le raccourci copie un texte de la forme :
//   QUOTIDIEN date=2026-10-16 pas=8 234 kcal=1 720,5
// (les nombres peuvent être au format français : espaces, virgule).

import { update } from './storage.js';
import { dateKey, fmt } from './util.js';

export const SHORTCUT_NAME = 'Quotidien';
export const SHORTCUT_URL = `shortcuts://run-shortcut?name=${encodeURIComponent(SHORTCUT_NAME)}`;


export function parse(text) {
  if (!/^\s*QUOTIDIEN\b/i.test(text || '')) return null;
  const out = { date: dateKey(), values: {} };
  // clé=valeur jusqu'à la clé suivante (les valeurs peuvent contenir des espaces)
  const re = /(\w+)=([^=]*?)(?=\s+\w+=|$)/g;
  for (const [, key, raw] of text.trim().matchAll(re)) {
    if (key === 'date') {
      if (/^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) out.date = raw.trim();
    } else if (key === 'pas' || key === 'kcal') {
      const n = parseFloat(raw.replace(/[^\d,.-]/g, '').replace(',', '.'));
      if (!isNaN(n)) out.values[key] = Math.round(n);
    }
  }
  return out;
}

// Enregistre les valeurs importées dans les essentiels du jour. Renvoie la liste des changements.
export function apply({ date, values }) {
  const changes = [];
  update(d => {
    const l = (d.log[date] ??= {});
    if (values.pas != null) { l.pas = values.pas; changes.push(`${fmt(values.pas)} pas`); }
    if (values.kcal != null) { l.kcal = values.kcal; changes.push(`${fmt(values.kcal)} kcal`); }
  });
  return changes;
}
