// Saisie d'une journée de cours, un cours à la fois.
// Chaque panneau : matière, type, début, fin, salle → « Cours suivant » ou « Fin de la journée ».
// À la fin : ce jour seulement (planning.days[jour].slots) ou toutes les semaines (emploi du temps).

import { getData, update } from './storage.js';
import { parseKey, addDays, esc, uid } from './util.js';
import { openSheet } from './sheet.js';
import { toMin, toHHMM } from './planning-model.js';

const KINDS = ['CM', 'TD', 'TP', 'CM-TD'];
const WEEKDAYS = ['dimanches', 'lundis', 'mardis', 'mercredis', 'jeudis', 'vendredis', 'samedis'];
const long = k => parseKey(k).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

export function courseWizard(key, done) {
  step(key, [], done);
}

function step(key, slots, done) {
  const p = getData().planning;
  const prev = slots.at(-1);
  const start = prev ? toHHMM(toMin(prev.end) + 15) : '08:30';
  const end = toHHMM(toMin(start) + 90);
  const subj = id => p.subjects.find(s => s.id === id);
  const n = slots.length + 1;

  const form = openSheet({
    title: `Cours n°${n}`,
    saveLabel: '+ Cours suivant',
    body: `
      ${slots.length ? `<div class="wiz-done">${slots.map(s =>
        `<span><b class="mono">${s.start}–${s.end}</b> ${esc(subj(s.subject)?.short || '?')} · ${s.kind}</span>`).join('')}</div>` : `
        <p class="small muted">${long(key)} : saisis tes cours dans l'ordre. Le début du suivant sera pré-rempli.</p>`}
      <label>Matière <select name="subject">${p.subjects.map(s =>
        `<option value="${s.id}" ${prev?.subject === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>
      <fieldset><legend>Type</legend>
        <div class="chips-pick">${KINDS.map(k => `<label><input type="radio" name="kind" value="${k}" ${k === (prev?.kind || 'CM') ? 'checked' : ''}><span>${k}</span></label>`).join('')}</div>
      </fieldset>
      <div class="grid2">
        <label>Début <input type="time" name="start" value="${start}"></label>
        <label>Fin <input type="time" name="end" value="${end}"></label>
      </div>
      <label>Salle <span class="small muted">(facultatif)</span><input name="room" maxlength="30" value="${esc(prev?.room || '')}"></label>
      ${slots.length ? '<button type="button" class="link wiz-stop" data-stop>La journée s\'arrête au cours précédent</button>' : ''}`,
    onSave: f => {
      const s = read(f, prev);
      if (typeof s === 'string') return s;
      setTimeout(() => step(key, [...slots, s], done), 0);
    },
    extra: {
      label: '✓ C\'est le dernier cours',
      onClick: () => {
        const s = read(new FormData(form), prev);
        if (typeof s === 'string') { alert(s); return step(key, slots, done); }
        scope(key, [...slots, s], done);
      },
    },
  });
  form.querySelector('[data-stop]')?.addEventListener('click', () => {
    form.closest('.sheet-backdrop').remove();
    document.body.classList.remove('no-scroll');
    scope(key, slots, done);
  });
  // la fin suit le début (même durée) tant qu'on ne l'a pas touchée
  const [a, b] = ['start', 'end'].map(x => form.querySelector(`[name=${x}]`));
  let touched = false;
  b.addEventListener('input', () => { touched = true; });
  a.addEventListener('input', () => { if (!touched && a.value) b.value = toHHMM(toMin(a.value) + 90); });
}

function read(f, prev) {
  const s = { id: uid(), subject: f.get('subject'), kind: f.get('kind'), start: f.get('start'), end: f.get('end'), room: f.get('room').trim() };
  if (!s.start || !s.end || s.end <= s.start) return 'La fin du cours doit être après le début.';
  if (prev && s.start < prev.end) return `Ce cours commence avant la fin du précédent (${prev.end}).`;
  return s;
}

// Où ranger ces cours : ce jour seulement, ou toutes les semaines.
function scope(key, slots, done) {
  if (!slots.length) return done();
  const p = getData().planning;
  const wd = parseKey(key).getDay();
  const tt = p.courses.find(c => c.periods.some(per => key >= per.start && key <= per.end));
  const until = tt ? tt.periods.find(per => key >= per.start && key <= per.end).end : addDays(key, 7 * 12);
  openSheet({
    title: 'Ta journée de cours',
    saveLabel: 'Enregistrer',
    body: `
      <div class="wiz-done">${slots.map(s => `<span><b class="mono">${s.start}–${s.end}</b> ${esc(p.subjects.find(x => x.id === s.subject)?.short || '?')} · ${s.kind}${s.room ? ` · ${esc(s.room)}` : ''}</span>`).join('')}</div>
      <fieldset><legend>Ces cours valent pour…</legend>
        <div class="segmented">
          <label><input type="radio" name="scope" value="jour" checked><span>Ce jour seulement</span></label>
          <label><input type="radio" name="scope" value="semaine"><span>Tous les ${WEEKDAYS[wd]}</span></label>
        </div>
      </fieldset>
      <label class="wiz-until" hidden>Jusqu'au <input type="date" name="until" value="${until}"></label>
      <p class="small muted wiz-note" hidden>${tt ? `Remplace les cours du ${WEEKDAYS[wd].slice(0, -1)} dans « ${esc(tt.name)} ».` : 'Crée un nouvel emploi du temps, modifiable dans Réglages → Emplois du temps.'}</p>`,
    onSave: f => {
      if (f.get('scope') === 'jour') {
        update(d => { d.planning.days[key] = { ...d.planning.days[key], type: 'cours', slots }; delete d.planning.days[key].items; });
      } else {
        const to = f.get('until');
        if (!to || to < key) return 'Choisis une date de fin après ce jour.';
        const weekly = slots.map(s => ({ ...s, day: wd }));
        update(d => {
          const c = tt && d.planning.courses.find(x => x.id === tt.id);
          if (c) c.slots = [...c.slots.filter(s => s.day !== wd), ...weekly];
          else d.planning.courses.push({ id: uid(), name: `Cours du ${WEEKDAYS[wd].slice(0, -1)}`, periods: [{ start: key, end: to }], except: [], slots: weekly });
          const cur = d.planning.days[key];
          if (cur) { delete cur.type; delete cur.slots; delete cur.items; if (!Object.keys(cur).length) delete d.planning.days[key]; }
        });
      }
      done();
    },
  });
  const form = document.querySelector('.sheet');
  form.addEventListener('change', () => {
    const week = form.querySelector('[name=scope]:checked').value === 'semaine';
    form.querySelector('.wiz-until').hidden = !week || Boolean(tt);
    form.querySelector('.wiz-note').hidden = !week;
  });
}
