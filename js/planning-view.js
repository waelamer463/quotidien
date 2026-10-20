import { getData, update } from './storage.js';
import { dateKey, addDays, parseKey, dayLabel, esc } from './util.js';
import { PRAYERS, PRAYER_NAMES, prayerTimes, METHODS } from './prayers.js';
import { DAY_TYPES, buildDay, baseItems, toStored, courseSlots, dayType, restDaysInMonth, toHHMM } from './planning-model.js';
import { openSheet, activityFields, readActivity } from './sheet.js';
import * as edit from './planning-edit.js';
import { icon } from './icons.js';
import { schedule } from './scheduler.js';
import { exportData, importFile, daysSinceExport } from './backup.js';
import { taskBlocks, blockSegments, handleTodoClick, editTask } from './todo-view.js';
import { gridHTML, bindGrid } from './grid-view.js';
import { startChrono } from './chrono-view.js';
import { courseWizard } from './course-wizard.js';
import { findConflicts, groupConflicts, suggestions } from './conflicts.js';

let day = dateKey();

// #planning, #planning/jour/AAAA-MM-JJ, #planning/reglages,
// #planning/modele/<type>, #planning/edt[/<id>], #planning/matieres
export function render(el, [sub, arg]) {
  if (sub === 'reglages') return renderSettings(el);
  if (sub === 'modele') return edit.renderTemplate(el, arg);
  if (sub === 'edt') return edit.renderTimetable(el, arg);
  if (sub === 'matieres') return edit.renderSubjects(el);
  if (sub === 'jour' && /^\d{4}-\d{2}-\d{2}$/.test(arg)) day = arg;
  return renderDay(el);
}

/* ---------- Journée ---------- */

function renderDay(el) {
  const { planning: p, tasks } = getData();
  const built = buildDay(p, day);
  const { type, items } = built;
  const sched = schedule(p, tasks, day, built);
  const month = day.slice(0, 7);
  const rest = restDaysInMonth(p, month);
  const overridden = Boolean(p.days[day]?.type || p.days[day]?.items || p.days[day]?.slots);
  const hasCourses = courseSlots(p, day).length > 0;
  const now = new Date();
  const nowMin = day === dateKey() ? now.getHours() * 60 + now.getMinutes() : -1;
  const asList = getData().settings.planView === 'liste';
  const all = [...items, ...taskBlocks(day)].sort((a, b) => a.start - b.start);
  const conflicts = findConflicts(all, p.days[day]?.okConflicts || []);
  const groups = groupConflicts(conflicts).slice(0, 3);
  const fixes = groups.map(g => suggestions(g, all));
  const grid = asList ? null : gridHTML(all, { nowMin, segments: sched.segments, conflicts: new Set(conflicts.flatMap(c => [c.a, c.b])) });

  el.innerHTML = `
    ${weekStrip(p)}
    <div class="daynav">
      <strong>${dayLabel(day)}</strong>
    </div>

    <div class="segmented three">
      ${Object.entries(DAY_TYPES).map(([k, t]) => `
        <button class="${type === k ? 'on' : ''}" data-type="${k}">
          ${icon(t.icon)}<span>${t.label}</span></button>`).join('')}
    </div>
    ${type === 'cours' ? `<button class="btn secondary small wiz-open" data-act="wizard">${icon('course')}${hasCourses ? 'Saisir à nouveau les cours de ce jour' : 'Saisir les cours de ce jour'}</button>` : ''}
    <p class="small muted rest-count ${rest > p.restPerMonth ? 'warn' : ''}">
      Repos ce mois-ci : <b>${rest} / ${p.restPerMonth}</b>
    </p>
    ${overridden ? `<p class="small muted modified">${p.days[day]?.items ? 'Journée modifiée à la main' : p.days[day]?.slots ? 'Cours saisis pour ce jour' : 'Type de jour changé'} ·
      <button class="link" data-act="reset">Revenir au planning prévu</button></p>` : ''}

    ${conflicts.length ? `
      <div class="card banner warn conflicts">
        <strong>${conflicts.length} chevauchement${conflicts.length > 1 ? 's' : ''}</strong>
        ${groups.map((g, i) => `
          <div class="conflict">
            <p class="small"><b>${esc(g.flex.label)}</b> ${toHHMM(g.flex.start)}–${toHHMM(g.flex.end)} chevauche
              ${g.others.map(o => `<b>${esc(o.label)}</b> ${toHHMM(o.start)}–${toHHMM(o.end)}`).join(' et ')}</p>
            <div class="fixes">${fixes[i].map((f, j) => `<button class="fix ${f.accept ? 'keep' : ''}" data-fix="${i}:${j}">${esc(f.label)}</button>`).join('')}</div>
          </div>`).join('')}
      </div>` : ''}

    <div class="ess-head">
      <h2 class="section-title">Journée</h2>
      <div class="mini-seg">
        <button class="${asList ? '' : 'on'}" data-view="grille">Grille</button>
        <button class="${asList ? 'on' : ''}" data-view="liste">Liste</button>
      </div>
    </div>
    ${asList ? `<div class="timeline">
      ${all.map(it => row(it, nowMin, sched.segments.filter(sg => it.eid != null && sg.block === it.eid))).join('')}
    </div>` : grid.html}
    <button class="btn secondary add-act" data-act="add">${icon('plus')}Ajouter une activité</button>
    <p class="small muted center">${asList ? 'Touche une activité pour la modifier, une prière pour la rattraper ou non.'
      : 'Touche une brique pour la modifier. Appui long puis glisse pour la déplacer, poignée du bas pour changer sa durée.'}</p>`;

  if (!asList) {
    bindGrid(el, grid, {
      onTap: it => {
        if (it.taskId) editTask(getData().tasks.find(t => t.id === it.taskId), () => renderDay(el));
        else if (it.eid != null) editActivity(el, it.eid);
      },
      onChange: (it, start, end) => { moveBrick(it, start, end); renderDay(el); },
      onPrayer: it => {
        setDay(d => { d.prayers = { ...d.prayers, [it.prayer]: it.deferred ? 'heure' : 'rattrapage' }; });
        renderDay(el);
      },
    });
  }

  el.onclick = e => {
    if (handleTodoClick(e, day, () => renderDay(el))) return;
    const fx = e.target.closest('[data-fix]');
    if (fx) {
      const [i, j] = fx.dataset.fix.split(':').map(Number);
      applyFix(fixes[i][j]);
      return renderDay(el);
    }
    const v = e.target.closest('[data-view]');
    if (v) { update(d => { d.settings.planView = v.dataset.view; }); return renderDay(el); }
    if (e.target.closest('.grid')) return; // gestes gérés par la grille
    const t = e.target.closest('[data-type],[data-act],[data-day],[data-eid]');
    if (!t) return;
    if (t.dataset.eid) return editActivity(el, Number(t.dataset.eid));
    if (t.dataset.act === 'add') return editActivity(el, null);
    if (t.dataset.act === 'wizard' || (t.dataset.type === 'cours' && !courseSlots(p, day).length)) {
      return courseWizard(day, () => renderDay(el));
    }
    if (t.dataset.day) day = t.dataset.day;
    else if (t.dataset.type) {
      const auto = courseSlots(p, day).length ? 'cours' : 'bibliotheque';
      // changer de type repart du modèle de ce type
      setDay(d => { d.type = t.dataset.type === auto ? undefined : t.dataset.type; delete d.items; });
    } else if (t.dataset.act === 'reset') setDay(d => { for (const k in d) delete d[k]; });
    else if (t.dataset.act === 'week') day = addDays(day, Number(t.dataset.n) * 7);
    else if (t.dataset.act === 'prayer') {
      const name = t.dataset.prayer;
      const deferred = t.dataset.deferred === '1';
      setDay(d => { d.prayers = { ...d.prayers, [name]: deferred ? 'heure' : 'rattrapage' }; });
    }
    renderDay(el);
  };
}

function applyFix(f) {
  if (f.accept) setDay(d => { d.okConflicts = [...(d.okConflicts || []), ...f.accept]; });
  else if (f.tomorrow) update(d => {
    const t = d.tasks.find(x => x.id === f.it.taskId);
    t.date = addDays(t.date, 1);
    t.postponed = (t.postponed || 0) + 1;
  });
  else moveBrick(f.it, f.start, f.end);
}

// Déplacement / redimensionnement d'une brique (ce jour seulement).
function moveBrick(it, start, end) {
  if (it.taskId) {
    update(d => {
      const t = d.tasks.find(x => x.id === it.taskId);
      Object.assign(t, { start: toHHMM(start), end: toHHMM(end), duration: end - start });
    });
    return;
  }
  const p = getData().planning;
  const list = p.days[day]?.items || baseItems(p, day).map(toStored);
  const next = list.map((a, i) => (i === it.eid ? { ...a, start: toHHMM(start), end: toHHMM(end) } : a));
  setDay(d => { d.items = next; }); // l'ordre est conservé pour garder les repères (eid)
}

// Un cours s'appelle « Analyse · TD » : on retrouve la matière par son nom court.
function subjectFromLabel(label) {
  const short = label.split(' · ')[0];
  return getData().planning.subjects.find(s => s.short === short)?.id || null;
}
const minutesBetween = (a, b) => { const m = s => { const [h, mm] = s.split(':').map(Number); return h * 60 + mm; }; return m(b) - m(a); };

// Modifier / ajouter une activité de ce jour : la journée est d'abord "figée" pour ne toucher qu'elle.
function editActivity(el, eid) {
  const p = getData().planning;
  const list = p.days[day]?.items || baseItems(p, day).map(toStored);
  const a = eid === null ? null : list[eid];
  openSheet({
    title: a ? 'Modifier l\'activité' : 'Nouvelle activité',
    body: activityFields(a || {}) + '<p class="small muted">Ne change que cette journée.</p>',
    onSave: f => {
      const [act, err] = readActivity(f, a || {});
      if (err) return err;
      const next = [...list];
      if (a) next[eid] = act; else next.push(act);
      next.sort((x, y) => x.start.localeCompare(y.start));
      setDay(d => { d.items = next; });
      renderDay(el);
    },
    extra: a && ['travail', 'cours'].includes(a.kind) ? { label: 'Lancer le chrono', onClick: () => startChrono({
      label: a.label, subject: subjectFromLabel(a.label), planned: minutesBetween(a.start, a.end) }) } : null,
    onDelete: a && (() => {
      setDay(d => { d.items = list.filter((_, i) => i !== eid); });
      renderDay(el);
    }),
  });
}

// Modifie (ou crée) la configuration du jour affiché, et nettoie si elle devient vide.
function setDay(fn) {
  update(d => {
    const cur = { ...d.planning.days[day] };
    fn(cur);
    if (cur.type === undefined) delete cur.type;
    if (Object.keys(cur).length) d.planning.days[day] = cur;
    else delete d.planning.days[day];
  });
}

function weekStrip(p) {
  const d = parseKey(day);
  const monday = addDays(day, -((d.getDay() + 6) % 7));
  const today = dateKey();
  let cells = '';
  for (let i = 0; i < 7; i++) {
    const k = addDays(monday, i);
    const pd = parseKey(k);
    cells += `
      <button class="wday ${k === day ? 'on' : ''} ${k === today ? 'today' : ''}" data-day="${k}">
        <small>${'DLMMJVS'[pd.getDay()]}</small>
        <b>${pd.getDate()}</b>
        ${icon(DAY_TYPES[dayType(p, k)].icon)}
      </button>`;
  }
  return `<div class="week">
    <button class="icon-btn" data-act="week" data-n="-1" aria-label="Semaine précédente">${icon('left')}</button>
    <div class="wdays">${cells}</div>
    <button class="icon-btn" data-act="week" data-n="1" aria-label="Semaine suivante">${icon('right')}</button>
  </div>`;
}

function row(it, nowMin, segs = []) {
  const dur = it.end - it.start;
  const current = nowMin >= it.start && nowMin < it.end && !it.prayer;
  if (it.prayer) {
    return `
      <button class="tl-prayer ${it.deferred ? 'deferred' : ''}" data-act="prayer" data-prayer="${it.prayer}" data-deferred="${it.deferred ? 1 : 0}">
        <span class="tl-time">${toHHMM(it.start)}</span>
        <span class="tl-label">${it.label}</span>
        <span class="tl-note">${it.deferred ? `rattrapée${it.catchupAt != null ? ` à ${toHHMM(it.catchupAt)}` : ''} · prier à l'heure ?` : 'à l\'heure · rattraper ?'}</span>
      </button>`;
  }
  if (it.kind === 'tache') {
    return `
      <div class="tl-item k-tache p${it.priority} ${it.done ? 'done' : ''}">
        <span class="tl-time">${toHHMM(it.start)}<small>${toHHMM(it.end)}</small></span>
        <button class="tl-body tl-task" data-todo-edit="${it.taskId}"><span class="tl-label">${esc(it.label)}</span>
          <span class="tl-sub">To-do</span></button>
        <button class="task-check" data-todo-done="${it.taskId}" aria-label="Marquer faite">${icon('check')}</button>
      </div>`;
  }
  if (it.kind === 'sommeil') {
    return `<div class="tl-mark"><span class="tl-time">${toHHMM(it.start)}</span>${icon('moon')}<span>${it.label}</span></div>`;
  }
  const h = Math.max(48, Math.min(160, dur * 0.7));
  const style = it.color ? `style="--c:${it.color};min-height:${h}px"` : `style="min-height:${h}px"`;
  return `
    <div class="tl-item k-${it.kind} ${current ? 'now' : ''} ${it.optional ? 'optional' : ''} ${it.eid != null ? 'editable' : ''}"
      ${it.eid != null ? `data-eid="${it.eid}" role="button" tabindex="0"` : ''} ${style}>
      <span class="tl-time">${toHHMM(it.start)}<small>${toHHMM(it.end)}</small></span>
      <div class="tl-body">
        <span class="tl-label">${esc(it.label)}</span>
        ${it.sub ? `<span class="tl-sub">${esc(it.sub)}</span>` : ''}
        ${blockSegments(segs)}
      </div>
      <span class="tl-dur">${dur >= 60 ? `${Math.floor(dur / 60)} h${dur % 60 ? String(dur % 60).padStart(2, '0') : ''}` : `${dur} min`}</span>
    </div>`;
}

/* ---------- Réglages ---------- */

export function renderSettings(el, { embedded = false } = {}) {
  const p = getData().planning;
  const base = prayerTimes(new Date(), p.place);
  const stepper = (key, value, label, unit = 'min') => `
    <div class="set-row">
      <span>${label}</span>
      <span class="stepper">
        <button class="round sm" data-key="${key}" data-d="-1" aria-label="Moins">${icon('minus')}</button>
        <b>${value} ${unit}</b>
        <button class="round sm" data-key="${key}" data-d="1" aria-label="Plus">${icon('plus')}</button>
      </span>
    </div>`;

  el.innerHTML = `
    ${embedded ? '' : `<a class="back" href="#planning">${icon('left')}Retour</a>`}

    <div class="ess-head"><h2 class="section-title">Prières · ${esc(p.place.city)} (${p.place.method})</h2>
      <button class="link small" data-place>Lieu et méthode</button></div>
    <div class="card">
      <p class="small muted" style="margin-bottom:8px">Décale chaque prière pour coller aux horaires de ta mosquée.</p>
      ${PRAYERS.map(n => {
        const off = p.offsets[n] || 0;
        return `
        <div class="set-row">
          <span><b>${PRAYER_NAMES[n]}</b> ${toHHMM(base[n] + off)}
            <small class="muted">${off ? `(calcul ${toHHMM(base[n])} ${off > 0 ? '+' : ''}${off})` : ''}</small></span>
          <span class="stepper">
            <button class="round sm" data-off="${n}" data-d="-1" aria-label="Une minute plus tôt">${icon('minus')}</button>
            <b>${off > 0 ? '+' : ''}${off}</b>
            <button class="round sm" data-off="${n}" data-d="1" aria-label="Une minute plus tard">${icon('plus')}</button>
          </span>
        </div>`;
      }).join('')}
    </div>

    <div class="section-title">Rythme</div>
    <div class="card">
      ${stepper('wakeBeforeFajr', p.wakeBeforeFajr, 'Réveil avant le Fajr')}
      <div class="set-row">
        <span>Coucher</span>
        <input type="time" data-time="bedtime" value="${p.bedtime}">
      </div>
      ${stepper('restPerMonth', p.restPerMonth, 'Jours de repos par mois', 'j')}
    </div>

    <div class="section-title">Jours de cours</div>
    <div class="card">
      ${stepper('commute.cours', p.commute.cours, 'Trajet vers la fac')}
      ${stepper('coursRules.prep', p.coursRules.prep, 'Préparation le matin')}
      ${stepper('coursRules.lunch', p.coursRules.lunch, 'Déjeuner')}
      ${stepper('coursRules.dinner', p.coursRules.dinner, 'Dîner')}
      ${stepper('coursRules.eveningWork', p.coursRules.eveningWork, 'Travail du soir (si retard)')}
    </div>

    <div class="section-title">Concentration</div>
    <div class="card">
      ${stepper('focus.session', p.focus.session, 'Session de travail max')}
      ${stepper('focus.pause', p.focus.pause, 'Durée d\'une pause')}
      ${stepper('focus.maxPauses', p.focus.maxPauses, 'Pauses max par jour', '')}
    </div>

    <div class="section-title">Modifier</div>
    <a class="card row-link" href="#planning/edt"><span><span class="name">Emploi du temps de cours</span>
      <span class="muted small">Cours, semaines de validité, jours sans cours</span></span>${icon('right', 'chev')}</a>
    <a class="card row-link" href="#planning/matieres"><span><span class="name">Matières</span>
      <span class="muted small">${p.subjects.length} matières</span></span>${icon('right', 'chev')}</a>
    <a class="card row-link" href="#planning/modele/bibliotheque"><span><span class="name">Journée Bibliothèque</span>
      <span class="muted small">Horaires de la bibliothèque, repas, trajets…</span></span>${icon('right', 'chev')}</a>
    <a class="card row-link" href="#planning/modele/repos"><span><span class="name">Journée Repos</span>
      <span class="muted small">Ce qui est prévu les jours off</span></span>${icon('right', 'chev')}</a>

    <div class="section-title">Mes données</div>
    <div class="card">
      ${(() => {
        const n = daysSinceExport();
        return `<p class="small ${n === null || n > 7 ? 'backup-warn' : 'muted'}">${n === null ? 'Aucune sauvegarde pour l\'instant.'
          : n === 0 ? 'Dernière sauvegarde aujourd\'hui.' : `Dernière sauvegarde il y a ${n} jour${n > 1 ? 's' : ''}.`}
          Tes données ne sont que sur ce téléphone : exporte-les régulièrement.</p>`;
      })()}
      <div class="row2" style="margin-top:12px">
        <button class="btn small" data-export>Exporter</button>
        <label class="btn small secondary file-btn">Importer<input type="file" accept="application/json,.json" data-import hidden></label>
      </div>
      <p class="small muted backup-msg" hidden></p>
    </div>`;

  el.onclick = async e => {
    if (e.target.closest('[data-place]')) return editPlace(el);
    if (e.target.closest('[data-export]')) {
      const msg = await exportData();
      renderSettings(el, { embedded });
      return showMsg(el, msg);
    }
    const b = e.target.closest('[data-off],[data-key]');
    if (!b) return;
    const d = Number(b.dataset.d);
    update(({ planning: pl }) => {
      if (b.dataset.off) pl.offsets[b.dataset.off] = (pl.offsets[b.dataset.off] || 0) + d;
      else {
        const [a, k] = b.dataset.key.split('.');
        const step = { restPerMonth: 1, 'focus.maxPauses': 1, 'focus.session': 15 }[b.dataset.key] || 5;
        if (k) pl[a] = { ...pl[a], [k]: Math.max(0, pl[a][k] + d * step) };
        else pl[a] = Math.max(0, pl[a] + d * step);
      }
    });
    renderSettings(el, { embedded });
  };
  el.onchange = async e => {
    if (e.target.matches('[data-import]') && e.target.files[0]) {
      const err = await importFile(e.target.files[0]);
      if (err) showMsg(el, err);
      e.target.value = '';
      return;
    }
    if (e.target.dataset.time && e.target.value) {
      update(d => { d.planning[e.target.dataset.time] = e.target.value; });
    }
  };
  return 'Réglages';
}

function showMsg(el, msg) {
  const m = el.querySelector('.backup-msg');
  if (m) { m.textContent = msg; m.hidden = false; }
}

function editPlace(el) {
  const pl = getData().planning.place;
  openSheet({
    title: 'Lieu et méthode',
    body: `
      <label>Ville <input name="city" maxlength="40" value="${esc(pl.city)}"></label>
      <div class="grid2">
        <label>Latitude <input name="lat" inputmode="decimal" value="${pl.lat}"></label>
        <label>Longitude <input name="lng" inputmode="decimal" value="${pl.lng}"></label>
      </div>
      <button type="button" class="btn small secondary" data-geo>Utiliser ma position</button>
      <label>Méthode de calcul
        <select name="method">${Object.entries(METHODS).map(([k, m]) =>
          `<option value="${k}" ${pl.method === k ? 'selected' : ''}>${k} (Fajr ${m.fajr}°, Isha ${m.isha}°)</option>`).join('')}</select>
      </label>
      <p class="small muted">Tes décalages manuels (± min) restent appliqués.</p>`,
    onSave: f => {
      const lat = parseFloat(String(f.get('lat')).replace(',', '.'));
      const lng = parseFloat(String(f.get('lng')).replace(',', '.'));
      if (isNaN(lat) || isNaN(lng) || Math.abs(lat) > 66 || Math.abs(lng) > 180) return 'Coordonnées invalides.';
      update(d => { d.planning.place = { city: f.get('city').trim() || 'Ma ville', lat, lng, method: f.get('method') }; });
      renderSettings(el, { embedded });
    },
  });
  const sheet = document.querySelector('.sheet');
  sheet.querySelector('[data-geo]').addEventListener('click', ev => {
    const btn = ev.currentTarget;
    if (!navigator.geolocation) { btn.textContent = 'Position indisponible'; return; }
    btn.textContent = 'Recherche…';
    navigator.geolocation.getCurrentPosition(pos => {
      sheet.querySelector('[name=lat]').value = pos.coords.latitude.toFixed(4);
      sheet.querySelector('[name=lng]').value = pos.coords.longitude.toFixed(4);
      btn.textContent = 'Position trouvée';
    }, () => { btn.textContent = 'Position refusée'; }, { timeout: 10000 });
  });
}
