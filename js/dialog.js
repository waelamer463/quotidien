// Petite boîte de confirmation dans le style de l'app (remplace confirm/alert du système).

import { esc } from './util.js';

// ask({ title, text, ok, danger }) → Promise<boolean>
export function ask({ title, text = '', ok = 'Confirmer', cancel = 'Annuler', danger = false, dismiss = true }) {
  return new Promise(resolve => {
    const wrap = document.createElement('div');
    wrap.className = 'dialog-backdrop';
    wrap.innerHTML = `
      <div class="dialog" tabindex="-1" role="alertdialog" aria-modal="true" aria-labelledby="dlg-t">
        <strong id="dlg-t">${esc(title)}</strong>
        ${text ? `<p>${esc(text)}</p>` : ''}
        <div class="dialog-actions">
          ${cancel ? `<button class="btn secondary" data-v="0">${esc(cancel)}</button>` : ''}
          <button class="btn ${danger ? 'danger-fill' : ''}" data-v="1">${esc(ok)}</button>
        </div>
      </div>`;
    document.body.appendChild(wrap);
    const done = v => { wrap.classList.add('out'); setTimeout(() => wrap.remove(), 160); resolve(v); };
    wrap.addEventListener('click', e => {
      const b = e.target.closest('[data-v]');
      if (b) done(b.dataset.v === '1');
      else if (e.target === wrap && dismiss) done(false);
    });
    wrap.querySelector('.dialog').focus({ preventScroll: true });
  });
}

// Simple message (une seule action).
export const tell = (title, text = '') => ask({ title, text, ok: 'OK', cancel: null });
