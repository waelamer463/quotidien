// État vide commun : la mascotte, une phrase, éventuellement une action.

import { orb } from './orb.js';

export function emptyState(title, text = '', action = '', face = 'neutral') {
  return `<div class="empty-state"><span class="es-mascot">${orb(52, face)}</span>
    <div><b>${title}</b>${text ? `<p>${text}</p>` : ''}${action}</div></div>`;
}
