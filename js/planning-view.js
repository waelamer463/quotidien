import { getData, update } from './storage.js';
import { dateKey, addDays, parseKey, dayLabel, esc } from './util.js';
import { PRAYERS, PRAYER_NAMES, prayerTimes } from './prayers.js';
import { DAY_TYPES, buildDay, baseItems, toStored, courseSlots, dayType, restDaysInMonth, toHHMM } from './planning-model.js';
import { openSheet, activityFields, readActivity } from './sheet.js';
import * as edit from './planning-edit.js';

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
  const p = getData().planning;
  const { type, items } = buildDay(p, day);
  const month = day.slice(0, 7);
  const rest = restDaysInMonth(p, month);
  const overridden = Boolean(p.days[day]?.type || p.days[day]?.items);
  const hasCourses = courseSlots(p, day).length > 0;
  const now = new Date();
  const nowMin = day === dateKey() ? now.getHours() * 60 + now.getMinutes() : -1;

  el.innerHTML = `
    ${weekStrip(p)}
    <div class="daynav">
      <strong>${dayLabel(day)}</strong>
      <a class="chip" href="#planning/reglages">Réglages</a>
    </div>

    <div class="segmented three">
      ${Object.entries(DAY_TYPES).map(([k, t]) => `
        <button class="${type === k ? 'on' : ''}" data-type="${k}" ${k === 'cours' && !hasCourses ? 'disabled' : ''}>
          ${t.icon} ${t.label}</button>`).join('')}
    </div>
    <p class="small muted rest-count ${rest > p.restPerMonth ? 'warn' : ''}">
      Repos ce mois-ci : <b>${rest} / ${p.restPerMonth}</b>
    </p>
    ${overridden ? `<p class="small muted modified">${p.days[day]?.items ? 'Journée modifiée à la main' : 'Type de jour changé'} ·
      <button class="link" data-act="reset">Revenir au planning prévu</button></p>` : ''}

    <div class="timeline">
      ${items.map((it, i) => row(it, items[i + 1], nowMin)).join('')}
    </div>
    <button class="btn secondary add-act" data-act="add">+ Ajouter une activité</button>
    <p class="small muted center">Touche une activité pour la modifier, une prière pour la rattraper ou non.</p>`;

  el.onclick = e => {
    const t = e.target.closest('[data-type],[data-act],[data-day],[data-eid]');
    if (!t) return;
    if (t.dataset.eid) return editActivity(el, Number(t.dataset.eid));
    if (t.dataset.act === 'add') return editActivity(el, null);
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
        <span>${DAY_TYPES[dayType(p, k)].icon}</span>
      </button>`;
  }
  return `<div class="week">
    <button class="icon-btn" data-act="week" data-n="-1" aria-label="Semaine précédente">‹</button>
    <div class="wdays">${cells}</div>
    <button class="icon-btn" data-act="week" data-n="1" aria-label="Semaine suivante">›</button>
  </div>`;
}

function row(it, next, nowMin) {
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
  if (it.kind === 'sommeil') {
    return `<div class="tl-mark"><span class="tl-time">${toHHMM(it.start)}</span><span>🌙 ${it.label}</span></div>`;
  }
  const h = Math.max(48, Math.min(160, dur * 0.7));
  const style = it.color ? `style="--c:${it.color};min-height:${h}px"` : `style="min-height:${h}px"`;
  return `
    <div class="tl-item k-${it.kind} ${current ? 'now' : ''} ${it.optional ? 'optional' : ''} ${it.eid != null ? 'editable' : ''}"
      ${it.eid != null ? `data-eid="${it.eid}" role="button" tabindex="0"` : ''} ${style}>
      <span class="tl-time">${toHHMM(it.start)}<small>${toHHMM(it.end)}</small></span>
      <span class="tl-body">
        <span class="tl-label">${esc(it.label)}</span>
        ${it.sub ? `<span class="tl-sub">${esc(it.sub)}</span>` : ''}
      </span>
      <span class="tl-dur">${dur >= 60 ? `${Math.floor(dur / 60)} h${dur % 60 ? String(dur % 60).padStart(2, '0') : ''}` : `${dur} min`}</span>
    </div>`;
}

/* ---------- Réglages ---------- */

function renderSettings(el) {
  const p = getData().planning;
  const base = prayerTimes(new Date(), p.place);
  const stepper = (key, value, label, unit = 'min') => `
    <div class="set-row">
      <span>${label}</span>
      <span class="stepper">
        <button class="round sm" data-key="${key}" data-d="-1" aria-label="Moins">−</button>
        <b>${value} ${unit}</b>
        <button class="round sm" data-key="${key}" data-d="1" aria-label="Plus">+</button>
      </span>
    </div>`;

  el.innerHTML = `
    <a class="back" href="#planning">‹ Retour</a>

    <div class="section-title">Prières · ${esc(p.place.city)} (${p.place.method})</div>
    <div class="card">
      <p class="small muted" style="margin-bottom:8px">Décale chaque prière pour coller aux horaires de ta mosquée.</p>
      ${PRAYERS.map(n => {
        const off = p.offsets[n] || 0;
        return `
        <div class="set-row">
          <span><b>${PRAYER_NAMES[n]}</b> ${toHHMM(base[n] + off)}
            <small class="muted">${off ? `(calcul ${toHHMM(base[n])} ${off > 0 ? '+' : ''}${off})` : ''}</small></span>
          <span class="stepper">
            <button class="round sm" data-off="${n}" data-d="-1" aria-label="Une minute plus tôt">−</button>
            <b>${off > 0 ? '+' : ''}${off}</b>
            <button class="round sm" data-off="${n}" data-d="1" aria-label="Une minute plus tard">+</button>
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

    <div class="section-title">Modifier</div>
    <a class="card row-link" href="#planning/edt"><span><span class="name">Emploi du temps de cours</span>
      <span class="muted small">Cours, semaines de validité, jours sans cours</span></span><span aria-hidden="true">›</span></a>
    <a class="card row-link" href="#planning/matieres"><span><span class="name">Matières</span>
      <span class="muted small">${p.subjects.length} matières</span></span><span aria-hidden="true">›</span></a>
    <a class="card row-link" href="#planning/modele/bibliotheque"><span><span class="name">📚 Journée Bibliothèque</span>
      <span class="muted small">Horaires de la bibliothèque, repas, trajets…</span></span><span aria-hidden="true">›</span></a>
    <a class="card row-link" href="#planning/modele/repos"><span><span class="name">🌿 Journée Repos</span>
      <span class="muted small">Ce qui est prévu les jours off</span></span><span aria-hidden="true">›</span></a>`;

  el.onclick = e => {
    const b = e.target.closest('[data-off],[data-key]');
    if (!b) return;
    const d = Number(b.dataset.d);
    update(({ planning: pl }) => {
      if (b.dataset.off) pl.offsets[b.dataset.off] = (pl.offsets[b.dataset.off] || 0) + d;
      else {
        const [a, k] = b.dataset.key.split('.');
        const step = a === 'restPerMonth' ? 1 : 5;
        if (k) pl[a] = { ...pl[a], [k]: Math.max(0, pl[a][k] + d * step) };
        else pl[a] = Math.max(0, pl[a] + d * step);
      }
    });
    renderSettings(el);
  };
  el.onchange = e => {
    if (e.target.dataset.time && e.target.value) {
      update(d => { d.planning[e.target.dataset.time] = e.target.value; });
    }
  };
  return 'Réglages du planning';
}
