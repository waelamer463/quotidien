// Vue rapide (app Mac, ⌥ Espace) : ajouter une tâche en une ligne, cocher une prière ou la salle.

import { getData, onChange } from './storage.js';
import { dateKey, parseKey, esc } from './util.js';
import { parseQuick, addTask, PRIORITY, DIFFICULTY, ruleLabel } from './todo-model.js';
import { PRAYERS, PRAYER_NAMES } from './prayers.js';
import { buildDay } from './planning-model.js';
import { dayLog, setLog, cyclePrayer } from './essentials.js';
import { orb, react, startLife } from './orb.js';

const T = window.__TAURI__;
const me = T?.webviewWindow.getCurrentWebviewWindow();
const form = document.getElementById('f');
const input = document.getElementById('t');
const chips = document.getElementById('chips');
const habits = document.getElementById('habits');
const short = k => (k === dateKey() ? 'aujourd\'hui' : parseKey(k).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }));
const dur = m => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? String(m % 60).padStart(2, '0') : ''}` : `${m} min`);

document.getElementById('orb').innerHTML = orb(34, 'neutral');
startLife();

function preview() {
  const v = input.value.trim();
  if (!v) { chips.innerHTML = ''; return; }
  const today = dateKey();
  const subjects = getData().planning.subjects;
  const r = parseQuick(v, today, subjects);
  chips.innerHTML = [
    r.date === null ? 'boîte' : short(r.date),
    r.start ? `${r.start}–${r.end}` : r.duration ? dur(r.duration) : '',
    r.priority > 1 ? PRIORITY[r.priority] : '',
    r.difficulty !== 2 ? DIFFICULTY[r.difficulty] : '',
    r.deadline ? `pour ${short(r.deadline)}` : '',
    r.rule ? ruleLabel(r.rule) : '',
    r.subject ? subjects.find(s => s.id === r.subject)?.short : '',
  ].filter(Boolean).map(c => `<span>${esc(c)}</span>`).join('');
}

// prières de la journée pas encore notées, et la salle
function renderHabits() {
  const today = dateKey(), l = dayLog(today);
  const built = buildDay(getData().planning, today);
  const now = new Date().getHours() * 60 + new Date().getMinutes();
  const todo = PRAYERS.filter(n => !l.prayers?.[n] && built.prayers[n] <= now + 30);
  habits.innerHTML = `<span class="muted">Cocher :</span>
    ${todo.map(n => `<button data-prayer="${n}" data-late="${built.items.find(i => i.prayer === n)?.deferred ? 1 : 0}">✓ ${PRAYER_NAMES[n]}</button>`).join('')}
    <button data-gym class="${l.salle ? 'on' : ''}">${l.salle ? '✓ Salle faite' : '＋ Salle'}</button>`;
}

input.addEventListener('input', preview);
form.addEventListener('submit', e => {
  e.preventDefault();
  const r = parseQuick(input.value, dateKey(), getData().planning.subjects);
  if (!r.title) return;
  addTask(r);
  input.value = '';
  preview();
  react(document.querySelector('.qv-orb .orb'), 'joy');
  flash(`Ajoutée : ${r.title}`);
});
habits.addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.prayer) { cyclePrayer(dateKey(), b.dataset.prayer, b.dataset.late === '1'); flash(`${PRAYER_NAMES[b.dataset.prayer]} notée`); }
  if ('gym' in b.dataset) setLog(dateKey(), x => { if (x.salle) delete x.salle; else x.salle = true; });
  react(document.querySelector('.qv-orb .orb'), 'joy');
  renderHabits();
  input.focus();
});

function flash(text) {
  const h = document.querySelector('.qv-hint');
  h.textContent = text;
  h.classList.add('ok');
  setTimeout(() => { h.textContent = 'Entrée pour ajouter · Échap pour fermer · ⌥ Espace pour ouvrir de n\'importe où'; h.classList.remove('ok'); }, 1800);
}

const hide = () => me?.hide();
document.addEventListener('keydown', e => { if (e.key === 'Escape') hide(); });
// à chaque ouverture : champ vide et prêt à écrire ; fermeture quand on clique ailleurs
window.addEventListener('focus', () => { renderHabits(); input.focus(); input.select(); });
window.addEventListener('blur', () => setTimeout(() => { if (!document.hasFocus()) hide(); }, 150));
onChange(renderHabits);
renderHabits();
input.focus();
