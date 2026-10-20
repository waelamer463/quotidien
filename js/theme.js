// Thèmes : deux directions (Nuit polaire, Indigo aurore) × sombre / clair / automatique.
// Le choix est appliqué sur <html> (data-dir, data-mode) ; index.html l'applique aussi
// avant le premier affichage pour éviter un flash de la mauvaise couleur.

import { getData, update } from './storage.js';

export const DIRECTIONS = {
  polaire: { label: 'Nuit polaire', accent: '#4FE3F0', dark: '#070B16', light: '#EEF3FA' },
  aurore: { label: 'Indigo aurore', accent: '#9D8CFF', dark: '#0A0C1F', light: '#F2F0FB' },
};
export const MODES = { sombre: 'Sombre', clair: 'Clair', auto: 'Automatique' };

const media = window.matchMedia('(prefers-color-scheme: light)');

export function currentTheme() {
  return { dir: 'polaire', mode: 'sombre', ...getData().settings.theme };
}

export function applyTheme() {
  const { dir, mode } = currentTheme();
  const resolved = mode === 'auto' ? (media.matches ? 'clair' : 'sombre') : mode;
  const root = document.documentElement;
  root.dataset.dir = dir;
  root.dataset.mode = resolved;
  const color = DIRECTIONS[dir][resolved === 'clair' ? 'light' : 'dark'];
  document.querySelectorAll('meta[name="theme-color"]').forEach(m => m.setAttribute('content', color));
  try { localStorage.setItem('quotidien:theme', JSON.stringify({ dir, mode })); } catch {}
}

export function setTheme(patch) {
  update(d => { d.settings.theme = { ...currentTheme(), ...patch }; });
  applyTheme();
}

media.addEventListener?.('change', () => { if (currentTheme().mode === 'auto') applyTheme(); });
