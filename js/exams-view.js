// Onglet Examens : questionnaire de profil, liste, création, fiche d'une évaluation, profil de révision.

import { getData, update } from './storage.js';
import { dateKey, parseKey, esc, uid } from './util.js';
import { icon } from './icons.js';
import { openSheet } from './sheet.js';
import { EXAM_TYPES, FORMATS } from './revision-defaults.js';
import { daysUntil, countdownLabel, upcoming, past, readiness, saveExam, newExam, setMastery, examName } from './exams-model.js';
import { regenerate, planStats, windowOf, calibrate } from './revision-plan.js';
import { fmtMin } from './chrono.js';

const shortDate = k => parseKey(k).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });

const longDate = k => parseKey(k).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
const subjects = () => getData().planning.subjects;
const subj = id => subjects().find(s => s.id === id);

// #examens, #examens/nouveau, #examens/profil, #examens/<id>
export function render(el, [sub]) {
  const rev = getData().revision;
  if (sub === 'profil' || !rev.setupDone) return renderProfile(el, !rev.setupDone);
  if (sub === 'nouveau') return renderForm(el);
  if (sub) {
    const exam = getData().exams.find(x => x.id === sub);
    if (exam) return renderExam(el, exam);
  }
  return renderList(el);
}

/* ---------- Liste ---------- */

function renderList(el) {
  const next = upcoming();
  const done = past();
  el.innerHTML = `
    ${next.length ? next.map(examCard).join('') : `
      <div class="card empty-card">
        <h2>Aucune évaluation à venir</h2>
        <p class="muted">Ajoute tes partiels, CC et TP notés : l'app suivra ta préparation chapitre par chapitre.</p>
      </div>`}
    <a class="btn" href="#examens/nouveau">${icon('plus')}Nouvelle évaluation</a>

    ${done.length ? `<h2 class="section-title">Passées</h2>
      <div class="tasks">${done.map(e => `
        <a class="task row-link" href="#examens/${e.id}">
          <span class="grow"><span class="task-title">${esc(EXAM_TYPES[e.type])} · ${esc(examName(e))}</span>
            <span class="small muted">${longDate(e.date)} · coef. ${e.coef}</span></span>
          <b class="mono grade ${e.grade === null ? 'none' : ''}">${e.grade === null ? 'note ?' : `${String(e.grade).replace('.', ',')}/${e.gradeMax}`}</b>
        </a>`).join('')}</div>` : ''}

    <a class="card row-link profile-link" href="#examens/profil">
      <span class="grow"><span class="name">Profil de révision</span>
        <span class="muted small">Méthodes, délais, durée des sessions</span></span>${icon('right', 'chev')}</a>`;
  el.onclick = null;
  return 'Examens';
}

export function examCard(e, compact = false) {
  const r = readiness(e);
  const s = subj(e.subject);
  return `
    <a class="card exam-card ${compact ? 'compact' : ''}" href="#examens/${e.id}" style="--sc:${s?.color || 'var(--accent)'}">
      <span class="jx mono">${countdownLabel(e.date)}</span>
      <span class="grow">
        <span class="label">${esc(EXAM_TYPES[e.type])} · coef. ${e.coef}${e.time ? ` · ${e.time}` : ''}</span>
        <b>${esc(examName(e))}</b>
        <span class="bar"><i style="width:${Math.round(r * 100)}%"></i></span>
        <span class="label">Préparation ${Math.round(r * 100)} % · ${e.chapters.length} chapitre${e.chapters.length > 1 ? 's' : ''}</span>
      </span>
    </a>`;
}

/* ---------- Création ---------- */

function renderForm(el, e = null) {
  const isNew = !e;
  e = e || newExam({ subject: subjects()[0]?.id || null });
  el.innerHTML = `
    <a class="back" href="#examens">${icon('left')}Examens</a>
    <form class="form card exam-form">
      <fieldset><legend>Type</legend>
        <div class="chips-pick">${Object.entries(EXAM_TYPES).map(([k, l]) =>
          `<label><input type="radio" name="type" value="${k}" ${e.type === k ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>
      </fieldset>
      <label>Matière <select name="subject">${subjects().map(s => `<option value="${s.id}" ${e.subject === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>
      <label>Titre <span class="small muted">(facultatif)</span><input name="title" maxlength="60" value="${esc(e.title)}" placeholder="Ex. Partiel de mi-semestre"></label>
      <div class="grid2">
        <label>Date <input type="date" name="date" value="${e.date}" required></label>
        <label>Heure <input type="time" name="time" value="${e.time || ''}"></label>
      </div>
      <label>Coefficient <input name="coef" inputmode="decimal" value="${e.coef}"></label>
      ${isNew ? `<label>Chapitres <span class="small muted">(un par ligne)</span>
        <textarea name="chapters" rows="5" placeholder="Suites numériques&#10;Limites&#10;Continuité"></textarea></label>` : ''}

      <h3 class="q-title">Trois questions rapides</h3>
      <fieldset><legend>Difficulté ressentie de la matière</legend>
        <div class="segmented five">${[1, 2, 3, 4, 5].map(v => `<label><input type="radio" name="felt" value="${v}" ${e.felt === v ? 'checked' : ''}><span>${v}</span></label>`).join('')}</div>
        <p class="small muted scale"><span>facile</span><span>très dure</span></p>
      </fieldset>
      <fieldset><legend>Type d'épreuve</legend>
        <div class="chips-pick">${Object.entries(FORMATS).map(([k, l]) =>
          `<label><input type="radio" name="format" value="${k}" ${e.format === k ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>
      </fieldset>
      ${isNew ? `<fieldset><legend>Chapitres qui te font peur</legend>
        <div class="chips-pick multi" data-fear><span class="small muted">Écris d'abord les chapitres ci-dessus.</span></div>
      </fieldset>` : ''}
      <p class="error" hidden></p>
      <button class="btn" type="submit">${isNew ? 'Créer l\'évaluation' : 'Enregistrer'}</button>
    </form>`;

  const form = el.querySelector('form');
  const ta = form.querySelector('[name=chapters]');
  const fear = form.querySelector('[data-fear]');
  ta?.addEventListener('input', () => {
    const names = ta.value.split('\n').map(x => x.trim()).filter(Boolean);
    const checked = new Set([...fear.querySelectorAll('input:checked')].map(i => i.value));
    fear.innerHTML = names.length ? names.map(n => `<label><input type="checkbox" name="fear" value="${esc(n)}" ${checked.has(n) ? 'checked' : ''}><span>${esc(n)}</span></label>`).join('')
      : '<span class="small muted">Écris d\'abord les chapitres ci-dessus.</span>';
  });

  form.onsubmit = ev => {
    ev.preventDefault();
    const f = new FormData(form);
    const coef = parseFloat(String(f.get('coef')).replace(',', '.'));
    if (!f.get('date')) return showError(form, 'Choisis la date.');
    if (isNaN(coef) || coef <= 0) return showError(form, 'Le coefficient doit être un nombre positif.');
    const fears = new Set(f.getAll('fear'));
    const next = {
      ...e, type: f.get('type'), subject: f.get('subject'), title: f.get('title').trim(), date: f.get('date'),
      time: f.get('time') || '', coef, felt: Number(f.get('felt')), format: f.get('format'),
    };
    if (isNew) {
      next.chapters = String(f.get('chapters') || '').split('\n').map(x => x.trim()).filter(Boolean)
        .map(name => ({ id: uid(), name, mastery: fears.has(name) ? 1 : 2, fear: fears.has(name), history: [] }));
    }
    saveExam(next);
    regenerate();
    location.hash = `#examens/${next.id}`;
  };
  el.onclick = null;
  return isNew ? 'Nouvelle évaluation' : 'Modifier';
}

function showError(form, msg) {
  const p = form.querySelector('.error');
  p.textContent = msg;
  p.hidden = false;
}

/* ---------- Fiche d'une évaluation ---------- */

function renderExam(el, e) {
  const r = readiness(e);
  const C = 2 * Math.PI * 30;
  const passed = daysUntil(e.date) < 0;
  const s = subj(e.subject);
  el.innerHTML = `
    <a class="back" href="#examens">${icon('left')}Examens</a>
    <div class="card exam-head" style="--sc:${s?.color || 'var(--accent)'}">
      <div>
        <span class="jx big mono">${countdownLabel(e.date)}</span>
        <span class="label">${esc(EXAM_TYPES[e.type])} · ${esc(FORMATS[e.format] || '')} · coef. ${e.coef}</span>
        <span class="label">${longDate(e.date)}${e.time ? ` à ${e.time}` : ''}</span>
      </div>
      <div class="ring-dial ready">
        <svg viewBox="0 0 76 76"><circle class="t" cx="38" cy="38" r="30"/>
          <circle class="v" cx="38" cy="38" r="30" style="stroke-dasharray:${C};stroke-dashoffset:${C * (1 - r)}"/></svg>
        <span class="ring-val">${Math.round(r * 100)}%</span>
      </div>
    </div>

    ${passed ? `
      <div class="card grade-card">
        <b>Ta note</b>
        <div class="grade-input"><input name="grade" inputmode="decimal" value="${e.grade ?? ''}" placeholder="—" aria-label="Note">
          <span class="mono">/</span><input name="gradeMax" inputmode="numeric" value="${e.gradeMax}" aria-label="Sur"></div>
        <button class="btn small" data-act="grade">Enregistrer</button>
      </div>
      ${e.calibNote ? `<p class="small muted calib-note">${esc(e.calibNote)}</p>` : ''}` : ''}

    <div class="ess-head"><h2 class="section-title">Chapitres</h2><span class="small muted">maîtrise de 0 à 5</span></div>
    <div class="tasks chapters">
      ${e.chapters.map(c => `
        <div class="task chapter ${c.fear ? 'fear' : ''}">
          <button class="fear-btn" data-fear="${c.id}" aria-label="${c.fear ? 'Ne fait plus peur' : 'Fait peur'}" title="Chapitre qui fait peur">!</button>
          <span class="grow"><span class="task-title">${esc(c.name)}</span>
            <span class="mastery">${[0, 1, 2, 3, 4, 5].map(v => `<button class="m-dot ${v <= c.mastery && c.mastery > 0 ? 'on' : ''} ${v === c.mastery ? 'cur' : ''}" data-m="${c.id}:${v}" aria-label="Maîtrise ${v}">${v}</button>`).join('')}</span></span>
          <button class="icon-btn sm-btn" data-del-ch="${c.id}" aria-label="Retirer">${icon('close')}</button>
        </div>`).join('') || '<p class="small muted empty">Aucun chapitre. Ajoute-les ci-dessous.</p>'}
    </div>
    <form class="quick ch-add" data-ch-add>
      <input name="ch" placeholder="Ajouter un chapitre" maxlength="60">
      <button class="icon-btn" type="submit" aria-label="Ajouter">${icon('plus')}</button>
    </form>

    ${passed ? '' : planCard(e)}

    <div class="row2">
      <button class="btn secondary" data-act="edit">Modifier</button>
      <button class="btn danger" data-act="delete">Supprimer</button>
    </div>`;

  el.querySelector('[data-ch-add]').onsubmit = ev => {
    ev.preventDefault();
    const name = ev.target.ch.value.trim();
    if (!name) return;
    update(d => { d.exams.find(x => x.id === e.id).chapters.push({ id: uid(), name, mastery: 0, fear: false, history: [] }); });
    regenerate();
    renderExam(el, getData().exams.find(x => x.id === e.id));
    el.querySelector('[data-ch-add] input').focus();
  };

  el.onclick = ev => {
    const t = ev.target.closest('[data-m],[data-fear],[data-del-ch],[data-act],[data-open-day]');
    if (!t) return;
    const again = (replan = true) => { if (replan && !passed) regenerate(); renderExam(el, getData().exams.find(x => x.id === e.id)); };
    if (t.dataset.m) { const [cid, v] = t.dataset.m.split(':'); setMastery(e.id, cid, Number(v)); return again(); }
    if (t.dataset.fear) { update(d => { const c = d.exams.find(x => x.id === e.id).chapters.find(x => x.id === t.dataset.fear); c.fear = !c.fear; }); return again(); }
    if (t.dataset.delCh) { update(d => { const x = d.exams.find(y => y.id === e.id); x.chapters = x.chapters.filter(c => c.id !== t.dataset.delCh); }); return again(); }
    if (t.dataset.openDay) { location.hash = `#planning/jour/${t.dataset.openDay}`; return; }
    if (t.dataset.act === 'replan') { regenerate(); return again(false); }
    if (t.dataset.act === 'plan-toggle') { update(d => { const x = d.exams.find(y => y.id === e.id); x.planOff = !x.planOff; }); return again(); }
    if (t.dataset.act === 'edit') return renderForm(el, e);
    if (t.dataset.act === 'delete') {
      if (!confirm(`Supprimer « ${examName(e)} » ?`)) return;
      update(d => { d.exams = d.exams.filter(x => x.id !== e.id); });
      regenerate();
      location.hash = '#examens';
    }
    if (t.dataset.act === 'grade') {
      const g = parseFloat(String(el.querySelector('[name=grade]').value).replace(',', '.'));
      const max = parseInt(el.querySelector('[name=gradeMax]').value, 10) || 20;
      update(d => { const x = d.exams.find(y => y.id === e.id); x.grade = isNaN(g) ? null : g; x.gradeMax = max; });
      calibrate(getData().exams.find(x => x.id === e.id), e.readyAtExam ?? r);
      again(false);
    }
  };
  return examName(e);
}

function planCard(e) {
  if (e.planOff) return `
    <div class="card plan-card">
      <div class="plan-head"><b>Plan de révision</b><button class="link small" data-act="plan-toggle">Activer</button></div>
      <p class="small muted">Plan automatique désactivé pour cette évaluation.</p>
    </div>`;
  const st = planStats(e);
  const w = windowOf(e);
  const today = dateKey();
  const next = st.list.filter(t => !t.done && t.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  const byDay = {};
  next.forEach(t => { (byDay[t.date] ??= []).push(t); });
  const days = Object.keys(byDay).slice(0, 5);
  return `
    <div class="card plan-card">
      <div class="plan-head"><b>Plan de révision</b><span class="mono small muted">${st.done}/${st.n} séances</span></div>
      <span class="bar"><i style="width:${st.minutes ? Math.round(st.doneMin / st.minutes * 100) : 0}%"></i></span>
      <p class="small muted">${fmtMin(st.doneMin)} faites sur ${fmtMin(st.minutes)} · à partir du ${shortDate(w.from)}, jusqu'au ${shortDate(w.to)}</p>
      ${e.planOver ? `<p class="small warn-text">${fmtMin(e.planOver)} de révision ne rentrent pas dans ton temps de travail. Commence plus tôt (profil) ou augmente la part réservée aux révisions.</p>` : ''}
      ${!e.chapters.length ? '<p class="small muted">Ajoute des chapitres pour générer le plan.</p>' : ''}
      ${days.map(k => `
        <button class="plan-day" data-open-day="${k}">
          <span class="d mono">${k === today ? 'Auj.' : parseKey(k).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' })}</span>
          <span class="grow">${byDay[k].map(t => `<span>${esc(t.title)} <i class="mono">${fmtMin(t.duration)}</i></span>`).join('')}</span>
        </button>`).join('')}
      <div class="plan-actions">
        <button class="btn secondary small" data-act="replan">Recalculer</button>
        <button class="link small" data-act="plan-toggle">Désactiver</button>
      </div>
    </div>`;
}

/* ---------- Profil de révision (questionnaire au premier lancement) ---------- */

function renderProfile(el, firstTime) {
  const { profile: p, methods } = getData().revision;
  const pick = (name, values, cur, fmt = v => v) => `<select name="${name}">${values.map(v => `<option value="${v}" ${v === cur ? 'selected' : ''}>${fmt(v)}</option>`).join('')}</select>`;
  const h = m => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? String(m % 60).padStart(2, '0') : ''}` : `${m} min`);

  el.innerHTML = `
    ${firstTime ? `<div class="card intro">
        <h2>Ton profil de révision</h2>
        <p class="muted">Quelques réglages pour que tes plans de révision te ressemblent. Ils sont pré-remplis d'après tes réponses ; tu pourras tout changer plus tard dans Réglages.</p>
      </div>` : `<a class="back" href="#examens">${icon('left')}Examens</a>`}
    <form class="form card profile-form">
      <fieldset><legend>Méthodes que tu utilises</legend>
        <div class="chips-pick multi">${methods.map(m => `<label><input type="checkbox" name="m" value="${m.id}" ${m.active ? 'checked' : ''}><span>${esc(m.name)}</span></label>`).join('')}</div>
        <p class="small muted">Les plans enchaînent les méthodes dans cet ordre : ${methods.filter(m => m.active).sort((a, b) => a.stage - b.stage).map(m => esc(m.name)).join(' → ')}.</p>
      </fieldset>
      <div class="grid2">
        <label>Réviser un partiel ${pick('sp', [7, 10, 14, 21, 30], p.startDays.partiel, v => `${v} jours avant`)}</label>
        <label>Réviser un CC / DS ${pick('sc', [3, 5, 7, 10, 14], p.startDays.cc, v => `${v} jours avant`)}</label>
        <label>Durée d'une session ${pick('sm', [45, 60, 90, 120, 150, 180], p.sessionMin, h)}</label>
        <label>Passages / chapitre ${pick('ps', [2, 3, 4, 5, 6], p.passes)}</label>
      </div>
      <label>Part de ton temps de travail pour réviser
        ${pick('sh', [0.5, 0.6, 0.7, 0.8, 0.9], p.share, v => `${Math.round(v * 100)} %`)}</label>
      <p class="small muted">Le reste (${Math.round((1 - p.share) * 100)} %) reste libre pour le travail courant et les devoirs.</p>
      ${(p.calib || 1) !== 1 ? `<p class="small muted">Ajustement appris de tes notes : plans ${p.calib > 1 ? `${Math.round((p.calib - 1) * 100)} % plus longs` : `${Math.round((1 - p.calib) * 100)} % plus légers`}.</p>` : ''}
      <button class="btn" type="submit">${firstTime ? 'Enregistrer mon profil' : 'Enregistrer'}</button>
    </form>

    <div class="ess-head"><h2 class="section-title">Méthodes (briques)</h2><button class="link small" data-add-method>Ajouter</button></div>
    <div class="tasks">
      ${methods.slice().sort((a, b) => a.stage - b.stage).map(m => `
        <button class="task row-link method ${m.active ? '' : 'off'}" data-method="${m.id}">
          <span class="stage mono">${m.stage}</span>
          <span class="grow"><span class="task-title">${esc(m.name)}</span>
            <span class="small muted">${h(m.minutes)} par séance${m.formats.length ? ` · ${m.formats.map(f => FORMATS[f]).join(', ')}` : ''}${m.active ? '' : ' · désactivée'}</span></span>
          <span class="weight mono" title="Préférence apprise de tes retours">${Math.round(m.weight * 100)}%</span>
        </button>`).join('')}
    </div>`;

  el.querySelector('form').onsubmit = ev => {
    ev.preventDefault();
    const f = new FormData(ev.target);
    const active = new Set(f.getAll('m'));
    if (!active.size) return alert('Garde au moins une méthode.');
    update(d => {
      const r = d.revision;
      r.methods.forEach(m => { m.active = active.has(m.id); });
      const sc = Number(f.get('sc'));
      r.profile = { ...r.profile, sessionMin: Number(f.get('sm')), passes: Number(f.get('ps')), share: Number(f.get('sh')),
        startDays: { ...r.profile.startDays, partiel: Number(f.get('sp')), cc: sc, ds: sc } };
      r.setupDone = true;
    });
    regenerate();
    if (location.hash === '#examens') window.dispatchEvent(new HashChangeEvent('hashchange'));
    else location.hash = '#examens';
  };

  el.onclick = ev => {
    const t = ev.target.closest('[data-method],[data-add-method]');
    if (!t) return;
    editMethod(getData().revision.methods.find(m => m.id === t.dataset.method), () => renderProfile(el, firstTime));
  };
  return firstTime ? 'Examens' : 'Profil de révision';
}

function editMethod(m, after) {
  const isNew = !m;
  m = m || { id: uid(), name: '', stage: 3, minutes: 60, active: true, weight: 1, formats: [] };
  openSheet({
    title: isNew ? 'Nouvelle méthode' : 'Méthode',
    body: `
      <label>Nom <input name="name" maxlength="40" value="${esc(m.name)}" placeholder="Ex. Refaire les TD"></label>
      <div class="grid2">
        <label>Étape <span class="small muted">(1 = en premier)</span><input name="stage" inputmode="numeric" value="${m.stage}"></label>
        <label>Durée (min) <input name="minutes" inputmode="numeric" value="${m.minutes}"></label>
      </div>
      <fieldset><legend>Surtout utile pour <span class="small muted">(vide = toutes les épreuves)</span></legend>
        <div class="chips-pick multi">${Object.entries(FORMATS).map(([k, l]) => `<label><input type="checkbox" name="formats" value="${k}" ${m.formats.includes(k) ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>
      </fieldset>
      <label class="switch"><input type="checkbox" name="active" ${m.active ? 'checked' : ''}><span>Utiliser cette méthode</span></label>`,
    onSave: f => {
      const name = f.get('name').trim();
      const stage = parseInt(f.get('stage'), 10), minutes = parseInt(f.get('minutes'), 10);
      if (!name) return 'Donne un nom.';
      if (!(stage >= 1) || !(minutes >= 5)) return 'Vérifie l\'étape et la durée.';
      const next = { ...m, name, stage, minutes, formats: f.getAll('formats'), active: f.get('active') === 'on' };
      update(d => {
        const i = d.revision.methods.findIndex(x => x.id === next.id);
        if (i >= 0) d.revision.methods[i] = next; else d.revision.methods.push(next);
      });
      after();
    },
    onDelete: !isNew && (() => {
      update(d => { d.revision.methods = d.revision.methods.filter(x => x.id !== m.id); });
      after();
    }),
  });
}
