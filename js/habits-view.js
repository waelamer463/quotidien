import { getData, update } from './storage.js';
import { dateKey, addDays, dayLabel, fmt, esc, uid } from './util.js';
import { TYPES, WEEK, PRESETS, isScheduled, status, goalLabel, daysLabel, progress } from './habits-model.js';

let day = dateKey(); // jour affiché (on peut revenir en arrière pour rattraper une saisie)

// Point d'entrée : params vient de l'URL (#habitudes/gerer, #habitudes/modifier/<id>…)
export function render(el, params) {
  const [sub, arg] = params;
  if (sub === 'gerer') return renderManage(el);
  if (sub === 'nouvelle') return renderForm(el, { ...PRESETS[arg] });
  if (sub === 'modifier') return renderForm(el, getData().habits.find(h => h.id === arg));
  return renderDay(el);
}

/* ---------- Saisie du jour ---------- */

function renderDay(el) {
  const { habits, entries } = getData();
  const today = dateKey();
  if (day > today) day = today;
  const values = entries[day] || {};
  const list = habits.filter(h => isScheduled(h, day));
  const done = list.filter(h => status(h, values[h.id]) === 'done').length;

  el.innerHTML = `
    <div class="daynav">
      <button class="icon-btn" data-act="prev" aria-label="Jour précédent">‹</button>
      <strong>${dayLabel(day)}</strong>
      <button class="icon-btn" data-act="next" aria-label="Jour suivant" ${day === today ? 'disabled' : ''}>›</button>
    </div>
    ${habits.length === 0 ? emptyState() : `
      <div class="summary">
        <span><b>${done}</b> / ${list.length} objectifs atteints</span>
        <div class="bar"><i style="width:${list.length ? (done / list.length) * 100 : 0}%"></i></div>
      </div>
      ${list.length ? list.map(h => habitCard(h, values[h.id] ?? 0)).join('') :
        '<p class="muted center">Aucune habitude prévue ce jour-là.</p>'}
      <a class="btn secondary" href="#habitudes/gerer">Gérer mes habitudes</a>
    `}`;

  el.onclick = e => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const card = btn.closest('[data-id]');
    const h = card && habits.find(x => x.id === card.dataset.id);
    const act = btn.dataset.act;

    if (act === 'prev') day = addDays(day, -1);
    else if (act === 'next') day = addDays(day, 1);
    else if (act === 'toggle') setValue(h, values[h.id] ? 0 : 1);
    else if (act === 'inc') setValue(h, (values[h.id] ?? 0) + h.step);
    else if (act === 'dec') setValue(h, Math.max(0, (values[h.id] ?? 0) - h.step));
    else if (act === 'edit') {
      const ed = card.querySelector('.editor');
      ed.hidden = !ed.hidden;
      if (!ed.hidden) ed.querySelector('input').focus();
      return;
    } else if (act === 'add' || act === 'set') {
      const n = parseFloat(card.querySelector('.editor input').value.replace(',', '.'));
      if (isNaN(n)) return;
      setValue(h, act === 'add' ? (values[h.id] ?? 0) + n : n);
    }
    renderDay(el);
  };

  // Entrée dans le champ de saisie = "Ajouter"
  el.onkeydown = e => {
    if (e.key === 'Enter' && e.target.matches('.editor input')) {
      e.target.closest('.editor').querySelector('[data-act="add"]').click();
    }
  };
}

function setValue(h, v) {
  update(d => {
    d.entries[day] ??= {};
    d.entries[day][h.id] = Math.max(0, Math.round(v * 100) / 100);
  });
}

function habitCard(h, value) {
  const st = status(h, value);
  if (h.type === 'check') {
    return `
      <button class="card habit check ${st}" data-id="${h.id}" data-act="toggle">
        <span class="name">${esc(h.name)}</span>
        <span class="tick" aria-hidden="true">✓</span>
      </button>`;
  }
  const hint = st === 'over' ? 'Limite dépassée' : st === 'done' ? 'Objectif atteint' : '';
  return `
    <div class="card habit ${st}" data-id="${h.id}">
      <div class="habit-head">
        <span class="name">${esc(h.name)}</span>
        <span class="goal">${goalLabel(h)}</span>
      </div>
      <div class="bar"><i style="width:${progress(h, value)}%"></i></div>
      <div class="qty">
        <button class="round" data-act="dec" aria-label="Retirer ${fmt(h.step)}">−</button>
        <button class="value" data-act="edit">
          ${fmt(value)} <small>${esc(h.unit)}</small>
          <span class="hint">${hint || 'Toucher pour saisir'}</span>
        </button>
        <button class="round" data-act="inc" aria-label="Ajouter ${fmt(h.step)}">+</button>
      </div>
      <div class="editor" hidden>
        <input type="text" inputmode="decimal" placeholder="Quantité" aria-label="Quantité">
        <button class="btn small" data-act="add">Ajouter</button>
        <button class="btn small secondary" data-act="set">Remplacer</button>
      </div>
    </div>`;
}

function emptyState() {
  return `
    <div class="card">
      <h2>Commence par tes habitudes</h2>
      <p class="muted">Choisis un modèle (modifiable) ou crée la tienne.</p>
    </div>
    ${presetButtons()}
    <a class="btn" href="#habitudes/nouvelle">+ Nouvelle habitude</a>`;
}

function presetButtons() {
  const used = new Set(getData().habits.map(h => h.name));
  const items = Object.entries(PRESETS).filter(([, p]) => !used.has(p.name));
  if (!items.length) return '';
  return `<div class="presets">${items.map(([k, p]) =>
    `<a class="chip" href="#habitudes/nouvelle/${k}">+ ${esc(p.name)}</a>`).join('')}</div>`;
}

/* ---------- Liste de gestion ---------- */

function renderManage(el) {
  const { habits } = getData();
  el.innerHTML = `
    <a class="back" href="#habitudes">‹ Retour</a>
    ${habits.map(h => `
      <a class="card row-link" href="#habitudes/modifier/${h.id}">
        <span>
          <span class="name">${esc(h.name)}</span>
          <span class="muted small">${[goalLabel(h) || TYPES.check, daysLabel(h)].join(' · ')}</span>
        </span>
        <span aria-hidden="true">›</span>
      </a>`).join('') || '<p class="muted center">Aucune habitude pour l\'instant.</p>'}
    ${presetButtons()}
    <a class="btn" href="#habitudes/nouvelle">+ Nouvelle habitude</a>`;
  el.onclick = null;
  return 'Mes habitudes';
}

/* ---------- Formulaire création / modification ---------- */

function renderForm(el, h) {
  const editing = Boolean(h?.id);
  h = { type: 'check', unit: '', step: 1, days: [0, 1, 2, 3, 4, 5, 6], start: null, end: null, ...h };
  const limited = Boolean(h.start || h.end);

  el.innerHTML = `
    <a class="back" href="#habitudes${editing ? '/gerer' : ''}">‹ Retour</a>
    <form class="form" data-type="${h.type}" novalidate>
      <label>Nom
        <input name="name" required maxlength="40" value="${esc(h.name)}" placeholder="Ex. Lecture">
      </label>

      <fieldset>
        <legend>Type d'objectif</legend>
        <div class="segmented">
          ${Object.entries(TYPES).map(([k, label]) => `
            <label><input type="radio" name="type" value="${k}" ${h.type === k ? 'checked' : ''}><span>${label}</span></label>`).join('')}
        </div>
      </fieldset>

      <div class="grid2 f-qty">
        <label class="f-min">Minimum
          <input name="min" inputmode="decimal" value="${h.min ?? ''}">
        </label>
        <label class="f-max">Maximum
          <input name="max" inputmode="decimal" value="${h.max ?? ''}">
        </label>
        <label>Unité
          <input name="unit" maxlength="12" value="${esc(h.unit)}" placeholder="pas, kcal, h…">
        </label>
        <label>Pas des boutons + / −
          <input name="step" inputmode="decimal" value="${h.step}">
        </label>
      </div>

      <fieldset>
        <legend>Jours</legend>
        <div class="days">
          ${WEEK.map(([d, l]) => `
            <label><input type="checkbox" name="days" value="${d}" ${h.days.includes(d) ? 'checked' : ''}><span>${l}</span></label>`).join('')}
        </div>
      </fieldset>

      <label class="switch">
        <input type="checkbox" name="limited" ${limited ? 'checked' : ''}>
        <span>Seulement sur une période</span>
      </label>
      <div class="grid2 f-period" ${limited ? '' : 'hidden'}>
        <label>Du <input type="date" name="start" value="${h.start || ''}"></label>
        <label>Au <input type="date" name="end" value="${h.end || ''}"></label>
      </div>

      <p class="error" hidden></p>
      <button class="btn" type="submit">${editing ? 'Enregistrer' : 'Créer l\'habitude'}</button>
      ${editing ? '<button class="btn danger" type="button" data-act="delete">Supprimer</button>' : ''}
    </form>`;

  const form = el.querySelector('form');
  const error = form.querySelector('.error');

  form.onchange = e => {
    if (e.target.name === 'type') form.dataset.type = e.target.value;
    if (e.target.name === 'limited') form.querySelector('.f-period').hidden = !e.target.checked;
  };

  form.onsubmit = e => {
    e.preventDefault();
    const f = new FormData(form);
    const num = k => parseFloat(String(f.get(k)).replace(',', '.'));
    const type = f.get('type');
    const habit = {
      id: h.id || uid(),
      created: h.created || dateKey(),
      name: f.get('name').trim(),
      type,
      unit: type === 'check' ? '' : f.get('unit').trim(),
      min: ['min', 'range'].includes(type) ? num('min') : null,
      max: ['max', 'range'].includes(type) ? num('max') : null,
      step: type === 'check' ? 1 : num('step') || 1,
      days: f.getAll('days').map(Number),
      start: f.get('limited') ? f.get('start') || null : null,
      end: f.get('limited') ? f.get('end') || null : null,
    };

    const problem =
      !habit.name ? 'Donne un nom à ton habitude.' :
      habit.min !== null && isNaN(habit.min) ? 'Indique un minimum.' :
      habit.max !== null && isNaN(habit.max) ? 'Indique un maximum.' :
      type === 'range' && habit.min > habit.max ? 'Le minimum doit être inférieur au maximum.' :
      !habit.days.length ? 'Choisis au moins un jour.' :
      habit.start && habit.end && habit.start > habit.end ? 'La date de fin est avant la date de début.' :
      '';
    if (problem) {
      error.textContent = problem;
      error.hidden = false;
      return;
    }

    update(d => {
      const i = d.habits.findIndex(x => x.id === habit.id);
      if (i >= 0) d.habits[i] = habit; else d.habits.push(habit);
    });
    location.hash = editing ? '#habitudes/gerer' : '#habitudes';
  };

  el.onclick = e => {
    if (e.target.dataset.act !== 'delete') return;
    if (!confirm(`Supprimer « ${h.name} » et tout son historique ?`)) return;
    update(d => {
      d.habits = d.habits.filter(x => x.id !== h.id);
      Object.values(d.entries).forEach(v => delete v[h.id]);
    });
    location.hash = '#habitudes/gerer';
  };

  return editing ? 'Modifier' : 'Nouvelle habitude';
}
