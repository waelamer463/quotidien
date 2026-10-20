// État vide commun : une phrase, éventuellement une action. (La mascotte s'y ajoutera.)

export function emptyState(title, text = '', action = '') {
  return `<div class="empty-state"><span class="es-mascot" aria-hidden="true"></span>
    <div><b>${title}</b>${text ? `<p>${text}</p>` : ''}${action}</div></div>`;
}
