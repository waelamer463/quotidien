// Retour en un clic après une séance de révision terminée (case cochée, glissé ou chrono).

import { getData, update, onChange } from './storage.js';
import { esc } from './util.js';
import { openSheet } from './sheet.js';
import { FEEDBACK, applyFeedback } from './revision-plan.js';

let waiting = false;

export function watchFeedback() {
  onChange(() => { if (!waiting) { waiting = true; setTimeout(check, 500); } });
}

function check() {
  // on attend qu'aucun autre panneau ne soit ouvert (ex. « Session enregistrée »)
  if (document.querySelector('.sheet-backdrop')) { setTimeout(check, 700); return; }
  waiting = false;
  const recent = Date.now() - 15 * 60000;
  const t = getData().tasks.find(x => x.rev && x.done && x.rev.fb === null && x.doneAt && Date.parse(x.doneAt) > recent);
  if (t) ask(t);
}

function ask(t) {
  update(d => { d.tasks.find(x => x.id === t.id).rev.fb = 'aucun'; }); // on ne redemande pas
  const e = getData().exams.find(x => x.id === t.rev.examId);
  const c = e?.chapters.find(x => x.id === t.rev.chapterId);
  openSheet({
    title: 'Séance terminée',
    saveLabel: 'Enregistrer',
    body: `
      <p><b>${esc(t.title)}</b></p>
      <fieldset><legend>Cette séance était…</legend>
        <div class="segmented three">${Object.entries(FEEDBACK).map(([k, l]) =>
          `<label><input type="radio" name="fb" value="${k}" ${k === 'efficace' ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>
      </fieldset>
      ${c ? `<fieldset><legend>Ta maîtrise de « ${esc(c.name)} » maintenant</legend>
        <div class="segmented six">${[0, 1, 2, 3, 4, 5].map(v =>
          `<label><input type="radio" name="m" value="${v}" ${v === c.mastery ? 'checked' : ''}><span>${v}</span></label>`).join('')}</div>
        <p class="small muted scale"><span>pas du tout</span><span>parfaitement</span></p>
      </fieldset>` : ''}
      <p class="small muted">Ton plan s'ajuste : méthodes efficaces plus souvent, chapitres maîtrisés moins souvent.</p>`,
    onSave: f => applyFeedback(t.id, f.get('fb'), c ? Number(f.get('m')) : null),
  });
}
