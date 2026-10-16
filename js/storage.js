// Toutes les données de l'app vivent dans un seul objet, sauvegardé dans localStorage.
// `version` permettra de migrer les données si leur structure change plus tard.

const KEY = 'quotidien:data';
const VERSION = 1;

function defaults() {
  return {
    version: VERSION,
    habits: [],      // définitions des habitudes (étape 2)
    entries: {},     // saisies par jour : { "2026-10-16": { habitId: valeur } }
    tasks: [],       // tâches du planning (étape 5)
    settings: {
      lastTab: 'habitudes',
      city: null,
      prayerMethod: 'UOIF',
      prayerOffsets: { fajr: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 },
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
    return { ...base, ...saved, settings: { ...base.settings, ...saved.settings } };
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
