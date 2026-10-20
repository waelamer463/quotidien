// Petit message en bas de l'écran, avec une action « Annuler » facultative.

let timer = null;

export function toast(text, undo = null) {
  document.getElementById('toast')?.remove();
  clearTimeout(timer);
  const el = document.createElement('div');
  el.id = 'toast';
  el.innerHTML = `<span></span>${undo ? '<button type="button">Annuler</button>' : ''}`;
  el.querySelector('span').textContent = text;
  document.body.appendChild(el);
  el.querySelector('button')?.addEventListener('click', () => { el.remove(); undo(); });
  timer = setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, 4000);
}
