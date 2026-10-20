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
    settings: {
      lastTab: 'aujourdhui',
      theme: { dir: 'polaire', mode: 'sombre' },
      mascot: { size: 'normal', mute: false, best: 0, recent: [] },
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
}

const listeners = [];
export const onChange = fn => listeners.push(fn);

export function update(fn) {
  fn(data);
  save();
  listeners.forEach(f => f());
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
