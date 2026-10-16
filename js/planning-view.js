import { getData, update } from './storage.js';
import { dateKey, addDays, parseKey, dayLabel, esc } from './util.js';
import { PRAYERS, PRAYER_NAMES, prayerTimes } from './prayers.js';
import { DAY_TYPES, buildDay, courseSlots, dayType, restDaysInMonth, toHHMM } from './planning-model.js';

let day = dateKey();

// #planning, #planning/jour/AAAA-MM-JJ, #planning/reglages
export function render(el, [sub, arg]) {
  if (sub === 'reglages') return renderSettings(el);
  if (sub === 'jour' && /^\d{4}-\d{2}-\d{2}$/.test(arg)) day = arg;
  return renderDay(el);
}

/* ---------- Journée ---------- */

function renderDay(el) {
  const p = getData().planning;
  const { type, items } = buildDay(p, day);
  const month = day.slice(0, 7);
  const rest = restDaysInMonth(p, month);
  const overridden = Boolean(p.days[day]?.type);
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
      ${overridden ? ' · <button class="link" data-act="reset">Revenir au planning prévu</button>' : ''}
    </p>

    <div class="timeline">
      ${items.map((it, i) => row(it, items[i + 1], nowMin)).join('')}
    </div>`;

  el.onclick = e => {
    const t = e.target.closest('[data-type],[data-act],[data-day]');
    if (!t) return;
    if (t.dataset.day) day = t.dataset.day;
    else if (t.dataset.type) {
      const auto = courseSlots(p, day).length ? 'cours' : 'bibliotheque';
      setDay(d => { d.type = t.dataset.type === auto ? undefined : t.dataset.type; });
    } else if (t.dataset.act === 'reset') setDay(d => { delete d.type; });
    else if (t.dataset.act === 'week') day = addDays(day, Number(t.dataset.n) * 7);
    else if (t.dataset.act === 'prayer') {
      const name = t.dataset.prayer;
      const deferred = t.dataset.deferred === '1';
      setDay(d => { d.prayers = { ...d.prayers, [name]: deferred ? 'heure' : 'rattrapage' }; });
    }
    renderDay(el);
  };
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
    <div class="tl-item k-${it.kind} ${current ? 'now' : ''} ${it.optional ? 'optional' : ''}" ${style}>
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
    </div>
    <p class="small muted center">Modèles de journée, emploi du temps et matières : modifiables à l'étape 4b.</p>`;

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
