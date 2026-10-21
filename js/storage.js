import { planningDefaults } from './planning-defaults.js';
import { revisionDefaults } from './revision-defaults.js';

// Toutes les données de l'app vivent dans un seul objet, sauvegardé dans localStorage.
// `version` permettra de migrer les données si leur structure change plus tard.

const KEY = 'quotidien:data';
const VERSION = 7;

function defaults() {
  return {
    version: VERSION,
    habits: [],      // définitions des habitudes (étape 2)
    entries: {},     // saisies par jour : { "2026-10-16": { habitId: valeur } }
    tasks: [],       // to-do (voir todo-model.js)
    series: [],      // tâches répétées
    planning: planningDefaults(),
    log: {},         // essentiels jour par jour (prières, kcal, pas, salle, sommeil)
    sessions: [],    // sessions de travail (chrono)
    chrono: null,    // chrono en cours
    exams: [],       // évaluations (mode examens)
    revision: revisionDefaults(), // profil de révision et méthodes
    weekly: {},      // objectifs de la semaine (bilan du dimanche)
    essentials: { kcalMin: 1600, kcalMax: 1900, steps: 7000, gymPerWeek: 3,
      workGoal: { bibliotheque: 360, cours: 120, repos: 0 }, sleepGoal: 450 }, // minutes
    meta: { keyTimes: {}, syncedAt: null }, // synchronisation : date de dernière modification de chaque partie
    settings: {
      lastTab: 'aujourdhui',
      theme: { dir: 'polaire', mode: 'sombre' },
      mascot: { size: 'normal', mute: false, best: 0, recent: [] },
    },
  };
}

let data = load();

// Repère les parties modifiées (pour la synchronisation). Les réglages propres à l'appareil
// (dernier onglet, phrases récentes de la mascotte) ne comptent pas.
const SKIP = new Set(['meta', 'version']);
const serial = (k, v) => {
  if (k === 'settings') return JSON.stringify({ ...v, lastTab: undefined, lastExport: undefined, mascot: v.mascot && { ...v.mascot, recent: undefined, hello: undefined } });
  if (k === 'revision') return JSON.stringify({ ...v, lastPlan: undefined }); // date du dernier recalcul du plan
  if (k === 'exams') return JSON.stringify(v.map(e => ({ ...e, planOver: undefined })));
  return JSON.stringify(v);
};
const cache = {};
for (const k of Object.keys(data)) if (!SKIP.has(k)) cache[k] = serial(k, data[k]);

function markChanged() {
  const now = Date.now();
  data.meta ??= { keyTimes: {}, syncedAt: null };
  for (const k of Object.keys(data)) {
    if (SKIP.has(k)) continue;
    const v = serial(k, data[k]);
    if (v !== cache[k]) { cache[k] = v; data.meta.keyTimes[k] = now; }
  }
}

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
      essentials: { ...base.essentials, ...saved.essentials },
      revision: { ...base.revision, ...saved.revision, profile: { ...base.revision.profile, ...saved.revision?.profile } },
    };
    // v2 : nouveaux horaires du modèle Bibliothèque (déjeuner 13h–14h30)
    if ((saved.version || 1) < 2) out.planning.templates = base.planning.templates;
    // v3 : l'habitude Travail (en heures) se remplit avec les tâches faites
    if ((saved.version || 1) < 3) {
      for (const h of out.habits) {
        if (h.name === 'Travail' && h.unit === 'h' && !h.source) { h.source = 'taches'; h.skipRest = true; }
      }
    }
    // v4 : les habitudes deviennent les « essentiels »
    if ((saved.version || 1) < 4) migrateFromHabits(out);
    // v5 : la difficulté des tâches devient une priorité
    if ((saved.version || 1) < 5) {
      out.tasks = out.tasks.map(t => ({ start: null, end: null, postponed: 0, seriesId: null, doneAt: null,
        ...t, priority: t.priority || (t.difficulty === 3 ? 2 : 1) }));
    }
    if (!['aujourdhui', 'planning', 'examens', 'stats'].includes(out.settings.lastTab)) out.settings.lastTab = 'aujourdhui';
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
  // app Mac : prévient les autres fenêtres (widget, vue rapide, fenêtre principale)
  window.__TAURI__?.event.emit('quotidien:data', { from: WINDOW }).catch(() => {});
}

// Une autre fenêtre (ou un autre onglet) a modifié les données : on les relit.
const WINDOW = window.__TAURI__?.webviewWindow?.getCurrentWebviewWindow?.().label || 'web';
function reloadFromOtherWindow() {
  data = load();
  for (const k of Object.keys(data)) if (!SKIP.has(k)) cache[k] = serial(k, data[k]);
  listeners.forEach(f => f({ remote: true, fromWindow: true }));
}
window.addEventListener('storage', e => { if (e.key === KEY) reloadFromOtherWindow(); });
window.__TAURI__?.event.listen('quotidien:data', e => { if (e.payload?.from !== WINDOW) reloadFromOtherWindow(); });

const listeners = [];
export const onChange = fn => listeners.push(fn);

export function update(fn) {
  fn(data);
  markChanged();
  save();
  listeners.forEach(f => f({ remote: false }));
}

// Applique des parties reçues d'un autre appareil (sans les marquer comme modifiées ici).
export function applyRemote(parts, times, syncedAt) {
  for (const [k, v] of Object.entries(parts)) {
    data[k] = k === 'settings'
      ? { ...v, lastTab: data.settings.lastTab, lastExport: data.settings.lastExport, mascot: { ...v.mascot, recent: data.settings.mascot?.recent || [], hello: data.settings.mascot?.hello } }
      : v;
    cache[k] = serial(k, data[k]);
    data.meta.keyTimes[k] = times[k];
  }
  if (syncedAt) data.meta.syncedAt = syncedAt;
  save();
  if (Object.keys(parts).length) listeners.forEach(f => f({ remote: true }));
}

export function setMeta(patch) {
  data.meta = { ...data.meta, ...patch };
  save();
}

// Demande au navigateur de ne pas effacer nos données en cas de manque d'espace.
export async function requestPersistence() {
  if (navigator.storage?.persist) {
    try { await navigator.storage.persist(); } catch {}
  }
}

// Reprend l'historique des anciennes habitudes (calories, pas, salle).
function migrateFromHabits(d) {
  const find = test => d.habits.find(test);
  const kcal = find(h => h.source === 'kcal' || /calorie/i.test(h.name));
  const pas = find(h => h.source === 'pas' || /marche|pas/i.test(h.name) && h.unit === 'pas');
  const gym = find(h => h.type === 'check' && /salle|sport|gym/i.test(h.name));
  for (const [key, v] of Object.entries(d.entries || {})) {
    const l = (d.log[key] ??= {});
    if (kcal && v[kcal.id]) l.kcal = v[kcal.id];
    if (pas && v[pas.id]) l.pas = v[pas.id];
    if (gym && v[gym.id]) l.salle = true;
  }
  if (kcal?.min) d.essentials.kcalMin = kcal.min;
  if (kcal?.max) d.essentials.kcalMax = kcal.max;
  if (pas?.min) d.essentials.steps = pas.min;
}
