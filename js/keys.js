// Raccourcis clavier (ordinateur).
//   ⌘1 à ⌘4 : onglets · ⌘, : réglages · ⌘N : nouvelle tâche · Espace : chrono (pause / reprise)
//   ⌘\ : replier la colonne de droite · Échap : fermer le panneau · ? : aide

import { running, pause, resume } from './chrono.js';
import { renderBar } from './chrono-view.js';
import { tell } from './dialog.js';

const TABS = ['aujourdhui', 'planning', 'examens', 'stats'];
export const HELP = [
  ['⌘1 à ⌘4', 'Aujourd\'hui, Planning, Examens, Stats'],
  ['⌘ ,', 'Réglages'],
  ['⌘ N', 'Nouvelle tâche'],
  ['Espace', 'Mettre en pause ou reprendre le chrono'],
  ['⌘ \\', 'Replier ou déplier la colonne de droite'],
  ['Échap', 'Fermer un panneau'],
];

const typing = () => document.activeElement?.matches?.('input, textarea, select, [contenteditable]');

export function initKeys({ toggleRail }) {
  document.addEventListener('keydown', e => {
    const mod = e.metaKey || e.ctrlKey;
    if (e.key === 'Escape') {
      const back = document.querySelector('.dialog-backdrop, .sheet-backdrop');
      if (back) {
        const close = back.querySelector('[data-close], [data-v="0"]');
        if (close) close.click(); else { back.remove(); document.body.classList.remove('no-scroll'); }
      }
      return;
    }
    if (mod && /^[1-4]$/.test(e.key)) { e.preventDefault(); location.hash = `#${TABS[Number(e.key) - 1]}`; return; }
    if (mod && e.key === ',') { e.preventDefault(); location.hash = '#reglages'; return; }
    if (mod && e.key === '\\') { e.preventDefault(); toggleRail(); return; }
    if (mod && e.key.toLowerCase() === 'n') {
      e.preventDefault();
      const input = document.querySelector('#rail:not([hidden]) [data-quick] input') || document.querySelector('#view [data-quick] input');
      if (input) { input.focus(); input.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
      else location.hash = '#aujourdhui';
      return;
    }
    if (typing() || mod || e.altKey || document.querySelector('.sheet-backdrop, .dialog-backdrop')) return;
    if (e.key === ' ' && running()) {
      e.preventDefault();
      if (running().paused) resume(); else pause();
      renderBar();
      if (location.hash.startsWith('#chrono')) window.dispatchEvent(new HashChangeEvent('hashchange'));
      return;
    }
    if (e.key === '?') tell('Raccourcis clavier', HELP.map(([k, l]) => `${k} : ${l}`).join(' · '));
  });
}
