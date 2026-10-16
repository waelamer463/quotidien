import { planningDefaults } from './planning-defaults.js';

// Toutes les données de l'app vivent dans un seul objet, sauvegardé dans localStorage.
// `version` permettra de migrer les données si leur structure change plus tard.

const KEY = 'quotidien:data';
const VERSION = 3;

function defaults() {
  return {
    version: VERSION,
    habits: [],      // définitions des habitudes (étape 2)
    entries: {},     // saisies par jour : { "2026-10-16": { habitId: valeur } }
    tasks: [],       // tâches du planning (étape 5)
    planning: planningDefaults(),
    settings: {
      lastTab: 'habitudes',
    },
  };
}

let data = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults();
    const saved = JSON.parse(raw);
    const base = defaults();
    const out = {
      ...base, ...saved,
      version: VERSION,
      settings: { ...base.settings, ...saved.settings },
      planning: { ...base.planning, ...saved.planning },
    };
    // v2 : nouveaux horaires du modèle Bibliothèque (déjeuner 13h–14h30)
    if ((saved.version || 1) < 2) out.planning.templates = base.planning.templates;
    // v3 : l'habitude Travail (en heures) se remplit avec les tâches faites
    if ((saved.version || 1) < 3) {
      for (const h of out.habits) {
        if (h.name === 'Travail' && h.unit === 'h' && !h.source) { h.source = 'taches'; h.skipRest = true; }
      }
    }
    return out;
  } catch {
    return defaults();
  }
}

export function getData() {
  return data;
}

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch (e) {
    console.error('Sauvegarde impossible', e);
  }
}

export function update(fn) {
  fn(data);
  save();
}

// Demande au navigateur de ne pas effacer nos données en cas de manque d'espace.
export async function requestPersistence() {
  if (navigator.storage?.persist) {
    try { await navigator.storage.persist(); } catch {}
  }
}
