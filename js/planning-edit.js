// Éditeurs du planning : modèles de journée, emploi du temps de cours, matières.

import { getData, update } from './storage.js';
import { parseKey, esc, uid } from './util.js';
import { DAY_TYPES, KINDS } from './planning-model.js';
import { openSheet, activityFields, readActivity } from './sheet.js';
import { icon } from './icons.js';

const DAYS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const shortDate = k => parseKey(k).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
const back = `<a class="back" href="#reglages">${icon('left')}Réglages</a>`;

/* ---------- Modèles de journée ---------- */

export function renderTemplate(el, type) {
  const p = getData().planning;
  if (!p.templates[type]) { location.hash = '#planning/reglages'; return; }
  const list = p.templates[type];

  el.innerHTML = `
    ${back}
    <p class="muted small" style="margin-top:0">S'applique à toutes les journées ${DAY_TYPES[type].label} non modifiées à la main.
      Prières, réveil, rattrapage et coucher sont ajoutés automatiquement.</p>
    <div class="timeline">
      ${list.map((a, i) => `
        <div class="tl-item k-${a.kind} editable" data-i="${i}" role="button" tabindex="0">
          <span class="tl-time">${a.start}<small>${a.end}</small></span>
          <span class="tl-body"><span class="tl-label">${esc(a.label)}</span>
            <span class="tl-sub">${KINDS[a.kind] || ''}${a.away ? ' · dehors' : ''}</span></span>
        </div>`).join('')}
    </div>
    <button class="btn secondary add-act" data-add>${icon('plus')}Ajouter une activité</button>`;

  el.onclick = e => {
    const t = e.target.closest('[data-i],[data-add]');
    if (!t) return;
    const i = t.dataset.i != null ? Number(t.dataset.i) : null;
    const a = i === null ? null : list[i];
    openSheet({
      title: a ? 'Modifier l\'activité' : 'Nouvelle activité',
      body: activityFields(a || {}),
      onSave: f => {
        const [act, err] = readActivity(f, a || {});
        if (err) return err;
        update(d => {
          const l = d.planning.templates[type];
          if (a) l[i] = act; else l.push(act);
          l.sort((x, y) => x.start.localeCompare(y.start));
        });
        renderTemplate(el, type);
      },
      onDelete: a && (() => {
        update(d => { d.planning.templates[type].splice(i, 1); });
        renderTemplate(el, type);
      }),
    });
  };
  return `Journée ${DAY_TYPES[type].label}`;
}

/* ---------- Emploi du temps de cours ---------- */

export function renderTimetable(el, id) {
  const p = getData().planning;
  const c = p.courses.find(x => x.id === id) || p.courses[0];
  if (!c) {
    el.innerHTML = `${back}<button class="btn" data-new>${icon('plus')}Créer un emploi du temps</button>`;
    el.onclick = e => { if (e.target.closest('[data-new]')) newTimetable(el, null); };
    return 'Emploi du temps';
  }
  const subj = sid => p.subjects.find(s => s.id === sid) || { short: '?', color: '#888' };

  el.innerHTML = `
    ${back}
    ${p.courses.length > 1 ? `<div class="presets">${p.courses.map(x =>
      `<a class="chip ${x.id === c.id ? 'on' : ''}" href="#planning/edt/${x.id}">${esc(x.name)}</a>`).join('')}</div>` : ''}

    <div class="card row-link" data-rename role="button" tabindex="0">
      <span><span class="name">${esc(c.name)}</span><span class="muted small">Toucher pour renommer</span></span>${icon('edit')}
    </div>

    <div class="section-title">Semaines où il s'applique</div>
    <div class="card">
      ${c.periods.map((per, i) => `
        <div class="set-row"><span>Du <b>${shortDate(per.start)}</b> au <b>${shortDate(per.end)}</b></span>
          <button class="link" data-del-period="${i}">Retirer</button></div>`).join('') || '<p class="muted small">Aucune période : cet emploi du temps ne s\'applique jamais.</p>'}
      <button class="btn small secondary" data-add-period style="margin-top:8px">${icon('plus')}Répéter sur une période</button>
    </div>

    <div class="section-title">Jours sans cours (fériés, annulations…)</div>
    <div class="card">
      <div class="presets">${c.except.map((k, i) =>
        `<button class="chip" data-del-except="${i}">${shortDate(k)} ${icon('close')}</button>`).join('') || '<span class="muted small">Aucun</span>'}</div>
      <button class="btn small secondary" data-add-except style="margin-top:8px">${icon('plus')}Ajouter un jour sans cours</button>
    </div>

    <div class="section-title">Semaine type</div>
    ${[1, 2, 3, 4, 5, 6].map(d => {
      const slots = c.slots.filter(s => s.day === d).sort((a, b) => a.start.localeCompare(b.start));
      return `
      <div class="edt-day">
        <div class="edt-head"><strong>${DAYS[d]}</strong>
          <button class="link" data-add-slot="${d}">${icon('plus')}Cours</button></div>
        ${slots.map(s => `
          <div class="tl-item k-cours editable" style="--c:${subj(s.subject).color}" data-slot="${s.id}" role="button" tabindex="0">
            <span class="tl-time">${s.start}<small>${s.end}</small></span>
            <span class="tl-body"><span class="tl-label">${esc(subj(s.subject).short)} · ${esc(s.kind)}</span>
              <span class="tl-sub">${esc(s.room || '')}</span></span>
          </div>`).join('') || '<p class="muted small edt-empty">Pas de cours (journée Bibliothèque)</p>'}
      </div>`;
    }).join('')}

    <div class="section-title">Autres</div>
    <button class="btn secondary" data-new>Copier pour un nouveau semestre</button>
    ${p.courses.length > 1 ? '<button class="btn danger" data-delete-tt>Supprimer cet emploi du temps</button>' : ''}`;

  const save = fn => { update(d => fn(d.planning.courses.find(x => x.id === c.id), d.planning)); renderTimetable(el, c.id); };

  el.onclick = e => {
    const t = e.target.closest('[data-rename],[data-add-period],[data-del-period],[data-add-except],[data-del-except],[data-add-slot],[data-slot],[data-new],[data-delete-tt]');
    if (!t) return;
    const ds = t.dataset;

    if ('rename' in ds) {
      openSheet({
        title: 'Nom de l\'emploi du temps',
        body: `<label>Nom <input name="name" maxlength="50" value="${esc(c.name)}"></label>`,
        onSave: f => { const n = f.get('name').trim(); if (!n) return 'Donne un nom.'; save(x => { x.name = n; }); },
      });
    } else if ('addPeriod' in ds) {
      openSheet({
        title: 'Répéter sur une période',
        body: `<p class="small muted">La semaine type s'applique chaque semaine entre ces deux dates.</p>
          <div class="grid2"><label>Du <input type="date" name="start"></label><label>Au <input type="date" name="end"></label></div>`,
        onSave: f => {
          const start = f.get('start'), end = f.get('end');
          if (!start || !end) return 'Choisis les deux dates.';
          if (end < start) return 'La fin est avant le début.';
          save(x => { x.periods.push({ start, end }); x.periods.sort((a, b) => a.start.localeCompare(b.start)); });
        },
      });
    } else if (ds.delPeriod != null) {
      save(x => { x.periods.splice(Number(ds.delPeriod), 1); });
    } else if ('addExcept' in ds) {
      openSheet({
        title: 'Jour sans cours',
        body: '<label>Date <input type="date" name="date"></label>',
        onSave: f => {
          const k = f.get('date');
          if (!k) return 'Choisis une date.';
          save(x => { if (!x.except.includes(k)) x.except.push(k); x.except.sort(); });
        },
      });
    } else if (ds.delExcept != null) {
      save(x => { x.except.splice(Number(ds.delExcept), 1); });
    } else if (ds.addSlot != null || ds.slot) {
      editSlot(c, ds.slot ? c.slots.find(s => s.id === ds.slot) : { day: Number(ds.addSlot) }, save);
    } else if ('new' in ds) {
      newTimetable(el, c);
    } else if ('deleteTt' in ds) {
      if (!confirm(`Supprimer « ${c.name} » ?`)) return;
      update(d => { d.planning.courses = d.planning.courses.filter(x => x.id !== c.id); });
      location.hash = '#planning/edt';
    }
  };
  return 'Emploi du temps';
}

function editSlot(c, s, save) {
  const p = getData().planning;
  const editing = Boolean(s.id);
  openSheet({
    title: editing ? 'Modifier le cours' : 'Nouveau cours',
    body: `
      <label>Matière
        <select name="subject">${p.subjects.map(m =>
          `<option value="${m.id}" ${s.subject === m.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select>
      </label>
      <label>Jour
        <select name="day">${[1, 2, 3, 4, 5, 6].map(d =>
          `<option value="${d}" ${s.day === d ? 'selected' : ''}>${DAYS[d]}</option>`).join('')}</select>
      </label>
      <div class="grid2">
        <label>Début <input type="time" name="start" value="${s.start || '08:30'}"></label>
        <label>Fin <input type="time" name="end" value="${s.end || '10:00'}"></label>
        <label>Type <input name="kind" list="kinds" value="${esc(s.kind || 'CM')}"></label>
        <label>Salle <input name="room" value="${esc(s.room || '')}"></label>
      </div>
      <datalist id="kinds"><option value="CM"><option value="TD"><option value="TP"><option value="CM-TD"></datalist>
      <p class="small muted">Change ce cours chaque semaine. Pour un seul jour, modifie-le directement dans le planning.</p>`,
    onSave: f => {
      const slot = {
        id: s.id || uid(),
        day: Number(f.get('day')),
        start: f.get('start'), end: f.get('end'),
        subject: f.get('subject'),
        kind: f.get('kind').trim(), room: f.get('room').trim(),
      };
      if (!slot.start || !slot.end || slot.end <= slot.start) return 'Vérifie les horaires.';
      save(x => {
        const i = x.slots.findIndex(y => y.id === slot.id);
        if (i >= 0) x.slots[i] = slot; else x.slots.push(slot);
      });
    },
    onDelete: editing && (() => save(x => { x.slots = x.slots.filter(y => y.id !== s.id); })),
  });
}

function newTimetable(el, from) {
  const id = uid();
  update(d => {
    d.planning.courses.push({
      id,
      name: from ? `${from.name} (copie)` : 'Nouvel emploi du temps',
      periods: [], except: [],
      slots: from ? from.slots.map(s => ({ ...s, id: uid() })) : [],
    });
  });
  location.hash = `#planning/edt/${id}`;
}

/* ---------- Matières ---------- */

export function renderSubjects(el) {
  const p = getData().planning;
  const used = id => p.courses.reduce((n, c) => n + c.slots.filter(s => s.subject === id).length, 0);

  el.innerHTML = `
    ${back}
    ${p.subjects.map(m => `
      <div class="card row-link editable" data-id="${m.id}" role="button" tabindex="0">
        <span class="subj-dot" style="background:${m.color}"></span>
        <span class="grow"><span class="name">${esc(m.name)}</span>
          <span class="muted small">${esc(m.short)} · ${used(m.id)} cours${m.weeklyGoal ? ` · ${m.weeklyGoal} h/sem.` : ''}</span></span>
        ${icon('right', 'chev')}
      </div>`).join('')}
    <button class="btn" data-add>${icon('plus')}Ajouter une matière</button>`;

  el.onclick = e => {
    const t = e.target.closest('[data-id],[data-add]');
    if (!t) return;
    const m = t.dataset.id ? p.subjects.find(x => x.id === t.dataset.id) : null;
    openSheet({
      title: m ? 'Modifier la matière' : 'Nouvelle matière',
      body: `
        <label>Nom complet <input name="name" maxlength="60" value="${esc(m?.name || '')}"></label>
        <label>Nom court (affiché dans le planning) <input name="short" maxlength="20" value="${esc(m?.short || '')}"></label>
        <label>Couleur <input type="color" name="color" value="${m?.color || '#4a6fa5'}"></label>
        <label>Objectif d'heures par semaine <input name="weeklyGoal" inputmode="decimal" value="${m?.weeklyGoal ?? ''}" placeholder="Ex. 8"></label>`,
      onSave: f => {
        const name = f.get('name').trim();
        if (!name) return 'Donne un nom.';
        const goal = parseFloat(String(f.get('weeklyGoal')).replace(',', '.'));
        const next = { id: m?.id || uid(), name, short: f.get('short').trim() || name, color: f.get('color'), weeklyGoal: isNaN(goal) ? null : goal };
        update(d => {
          const i = d.planning.subjects.findIndex(x => x.id === next.id);
          if (i >= 0) d.planning.subjects[i] = next; else d.planning.subjects.push(next);
        });
        renderSubjects(el);
      },
      onDelete: m && (() => {
        if (used(m.id) && !confirm(`${m.name} a ${used(m.id)} cours. Les supprimer aussi ?`)) return;
        update(d => {
          d.planning.subjects = d.planning.subjects.filter(x => x.id !== m.id);
          d.planning.courses.forEach(c => { c.slots = c.slots.filter(s => s.subject !== m.id); });
        });
        renderSubjects(el);
      }),
    });
  };
  return 'Matières';
}
