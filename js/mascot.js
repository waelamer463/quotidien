// La mascotte : humeur selon ta journée, réactions à ce que tu fais, petites phrases.
//
// Humeur (par priorité) : nuit > rappel (prière ou bloc dans 10 min) > retard / examen proche >
// série cassée > record ou objectif atteint > joie (juste après une action) > repos.
// Phrases : jamais deux fois la même d'affilée (12 dernières mémorisées), au plus une toutes
// les 2 min et 8 par jour (sauf quand tu la touches). Réglages : taille réduite, sourdine.

import { getData, update, onChange } from './storage.js';
import { dateKey, addDays, esc } from './util.js';
import { orb, react, startLife } from './orb.js';
import { buildDay, toMin, toHHMM } from './planning-model.js';
import { PRAYER_NAMES } from './prayers.js';
import { schedule } from './scheduler.js';
import { dayScore } from './insights.js';
import { upcoming, daysUntil, examName } from './exams-model.js';
import { goalOf, goalProgress } from './weekly.js';
import { weekStart, dayLog } from './essentials.js';
import { notify } from './desktop.js';

const PHRASES = {
  hello_morning: ['Bonjour ! On commence doucement ?', 'Nouvelle journée, nouvelle page.', 'Bien dormi ? Je t\'ai préparé la journée.', 'Salut ! Un petit coup d\'œil au planning ?'],
  hello_day: ['Re-bonjour !', 'Content de te revoir.', 'On reprend où on en était ?', 'Me revoilà.'],
  joy_task: ['Une de moins !', 'Bien joué.', 'Cochée, on continue ?', 'Joli travail.', 'Ça avance !'],
  joy_prayer: ['Prière notée.', 'Bien, c\'est noté.', 'Qu\'Allah l\'accepte.', 'Une de plus à l\'heure.'],
  joy_gym: ['Séance de salle notée, bravo !', 'Le corps aussi compte. Bien joué.', 'Salle cochée !'],
  joy_session: ['Session enregistrée, bien joué.', 'Encore du temps de travail de gagné.', 'Belle session !'],
  star_record: ['Nouveau record : {n} jours d\'affilée !', '{n} jours de suite, ton meilleur score !', 'Record battu : {n} jours !'],
  star_goal: ['Objectif de la semaine atteint !', 'Tu as tenu ton objectif. Quelle semaine !', 'Objectif rempli, bravo !'],
  rappel_prayer: ['{prayer} dans {min} min.', '{prayer} approche ({min} min).', 'Pense à {prayer}, dans {min} min.'],
  rappel_block: ['{block} commence dans {min} min.', 'Dans {min} min : {block}.', 'Prépare-toi, {block} dans {min} min.'],
  stress_late: ['{n} tâche(s) en retard. On les replace ?', 'Un peu de retard, rien de grave : on réajuste ?', 'Quelques tâches traînent, regarde la to-do.'],
  stress_exam: ['{exam} dans {days} j : « {chap} » est encore fragile.', 'J-{days} pour {exam}. On revoit « {chap} » ?', '« {chap} » mérite une séance avant {exam}.'],
  stress_overflow: ['Tout ne rentre pas aujourd\'hui. On reporte un peu ?', 'Journée chargée : choisis ce qui peut attendre.'],
  sad_broken: ['Série cassée… on repart aujourd\'hui ?', 'Une journée ne fait pas tout. On recommence.', 'Pas grave. Une petite victoire aujourd\'hui suffit.'],
  night: ['Il est tard. Bonne nuit.', 'Le sommeil compte aussi.', 'Repose-toi, demain on continue.', 'Bonne nuit, à demain.'],
  idle: ['On avance tranquillement.', 'Je suis là si tu as besoin.', 'Une tâche à la fois.', 'Tu gères.', 'Bois un peu d\'eau.', 'Petit rappel : fais des pauses.'],
  tap: ['Hé !', 'Oui ?', 'Je suis là !', 'Coucou !', 'Ça chatouille.'],
};

const SPACING = 120000; // 2 min entre deux phrases
const PER_DAY = 8;

let state = { face: 'neutral', key: 'idle', vars: {} };
let last = null;      // instantané pour repérer les nouvelles actions
let joyUntil = 0;
let lastTalk = 0;
let talkedToday = { day: null, n: 0 };
let bubbleTimer = null;
let seenRappel = new Set();

const settings = () => ({ size: 'normal', mute: false, best: 0, recent: [], ...getData().settings.mascot });
const saveSettings = patch => update(d => { d.settings.mascot = { ...settings(), ...patch }; });

/* ---------- Humeur ---------- */

function streak(today = dateKey()) {
  let n = 0;
  for (let k = addDays(today, -1); n < 400 && (dayScore(k) ?? 0) >= 60; k = addDays(k, -1)) n++;
  return n + ((dayScore(today) ?? 0) >= 60 ? 1 : 0);
}

export function mood(now = new Date()) {
  const d = getData(), p = d.planning, today = dateKey(now);
  const m = now.getHours() * 60 + now.getMinutes();
  const built = buildDay(p, today);
  const bed = toMin(p.bedtime);
  const wake = built.wake;
  if (m >= bed || m < wake) return { face: 'night', key: 'night' };

  // rappel : prière ou début de bloc dans les 10 min
  const soon = built.items.filter(i => i.start - m > 0 && i.start - m <= 10 && (i.prayer || ['travail', 'cours'].includes(i.kind)) && !i.deferred);
  if (soon.length) {
    const i = soon[0];
    return i.prayer ? { face: 'rappel', key: 'rappel_prayer', id: `${today}:${i.prayer}`, vars: { prayer: PRAYER_NAMES[i.prayer], min: i.start - m } }
      : { face: 'rappel', key: 'rappel_block', id: `${today}:${i.start}`, vars: { block: i.label, min: i.start - m } };
  }
  // retard
  const late = d.tasks.filter(t => !t.done && t.date && t.date < today).length;
  if (late) return { face: 'stress', key: 'stress_late', vars: { n: late } };
  const ex = upcoming(today).find(x => daysUntil(x.date, today) <= 7 && x.chapters.some(c => c.mastery <= 2));
  if (ex) {
    const weak = ex.chapters.filter(c => c.mastery <= 2).sort((a, b) => a.mastery - b.mastery)[0];
    return { face: 'stress', key: 'stress_exam', vars: { exam: examName(ex), days: daysUntil(ex.date, today), chap: weak.name } };
  }
  const sched = schedule(p, d.tasks, today, built);
  if (sched.overflow.length && sched.capacity > 0 && !p.days[today]?.overflowOk) return { face: 'stress', key: 'stress_overflow' };
  // série cassée (hier raté après au moins 3 jours) tant que rien n'est fait aujourd'hui
  const s = settings();
  const before = (() => { let n = 0; for (let k = addDays(today, -2); n < 400 && (dayScore(k) ?? 0) >= 60; k = addDays(k, -1)) n++; return n; })();
  if (before >= 3 && (dayScore(addDays(today, -1)) ?? 0) < 60 && (dayScore(today) ?? 0) < 30) return { face: 'sad', key: 'sad_broken' };
  // record / objectif
  const st = streak(today);
  if (st >= 3 && st > s.best) return { face: 'star', key: 'star_record', vars: { n: st }, record: st };
  const mon = weekStart(today);
  const g = goalProgress(goalOf(mon), mon, today);
  if (g && g.ratio >= 1) return { face: 'star', key: 'star_goal', id: `goal:${mon}` };
  if (Date.now() < joyUntil) return { face: 'joy', key: 'joy_task' };
  return { face: 'neutral', key: 'idle' };
}

/* ---------- Phrases ---------- */

function phrase(key, vars = {}) {
  const list = PHRASES[key] || PHRASES.idle;
  const recent = settings().recent;
  const fresh = list.map((_, i) => i).filter(i => !recent.includes(`${key}:${i}`));
  const i = (fresh.length ? fresh : list.map((_, j) => j))[Math.floor(Math.random() * (fresh.length || list.length))];
  saveSettings({ recent: [...recent, `${key}:${i}`].slice(-12) });
  return list[i].replace(/\{(\w+)\}/g, (_, v) => vars[v] ?? '');
}

function canTalk(force) {
  const s = settings();
  if (s.mute) return false;
  if (force) return true;
  const today = dateKey();
  if (talkedToday.day !== today) talkedToday = { day: today, n: 0 };
  return Date.now() - lastTalk > SPACING && talkedToday.n < PER_DAY && state.face !== 'night';
}

// Fait parler la mascotte (bulle près d'elle, ou dans le bandeau d'Aujourd'hui).
export function say(key, vars, { force = false, face = null } = {}) {
  if (!canTalk(force)) return false;
  const text = phrase(key, vars);
  lastTalk = Date.now();
  talkedToday.n++;
  const line = document.querySelector('.pal-strip .pal-line');
  if (line && !line.closest('[hidden]')) {
    line.textContent = text;
    line.classList.remove('flash'); void line.offsetWidth; line.classList.add('flash');
  } else {
    let b = document.getElementById('pal-bubble');
    if (!b) { b = document.createElement('div'); b.id = 'pal-bubble'; b.setAttribute('role', 'status'); document.body.appendChild(b); }
    b.textContent = text;
    b.className = 'show';
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(() => { b.className = ''; }, 4500);
  }
  if (face) document.querySelectorAll('.pal-live .orb').forEach(o => react(o, face));
  return true;
}

/* ---------- Affichage ---------- */

// Orbe de l'en-tête (tous les écrans) ; masquée quand le bandeau d'Aujourd'hui est visible.
export function renderHead() {
  const slot = document.getElementById('pal-head');
  if (!slot) return;
  const s = settings();
  const strip = Boolean(document.querySelector('.pal-strip'));
  slot.hidden = strip;
  if (slot.dataset.face !== state.face) {
    slot.innerHTML = orb(40, state.face);
    slot.dataset.face = state.face;
  }
  document.body.classList.toggle('pal-reduced', s.size === 'reduite');
}

// Bandeau en haut d'Aujourd'hui (taille normale seulement).
export function stripHTML() {
  if (settings().size === 'reduite') return '';
  const text = settings().mute ? '' : ambient();
  return `<div class="pal-strip pal-live"><button class="pal-orb" data-pal aria-label="Mascotte">${orb(64, state.face)}</button>
    <p class="pal-line">${esc(text)}</p></div>`;
}

let ambientCache = { key: null, text: '' };
function ambient() {
  if (ambientCache.key !== state.key + JSON.stringify(state.vars || {})) {
    const p = PHRASES[state.key] || PHRASES.idle;
    // le bandeau garde la même phrase tant que l'humeur ne change pas
    ambientCache = { key: state.key + JSON.stringify(state.vars || {}), text: p[Math.floor(Math.random() * p.length)].replace(/\{(\w+)\}/g, (_, v) => state.vars?.[v] ?? '') };
  }
  return ambientCache.text;
}

function refresh() {
  const prev = state.face;
  state = mood();
  if (state.record && state.record > settings().best) {
    saveSettings({ best: state.record });
    say('star_record', state.vars, { face: 'star' });
  }
  if (state.face === 'rappel' && state.id && !seenRappel.has(state.id)) {
    seenRappel.add(state.id);
    say(state.key, state.vars, { face: 'rappel' });
    notify(state.vars.prayer ? `${state.vars.prayer} dans ${state.vars.min} min` : `${state.vars.block} dans ${state.vars.min} min`,
      state.vars.prayer ? 'Prépare-toi pour la prière.' : 'Ton prochain bloc commence bientôt.');
  }
  if (prev !== state.face) {
    document.querySelectorAll('.pal-strip .pal-orb').forEach(b => { b.innerHTML = orb(64, state.face); react(b.querySelector('.orb'), state.face); });
    const line = document.querySelector('.pal-strip .pal-line');
    if (line && !settings().mute) line.textContent = ambient();
  }
  renderHead();
}

/* ---------- Actions repérées ---------- */

function snapshot() {
  const d = getData(), today = dateKey(), l = dayLog(today);
  return {
    today,
    done: d.tasks.filter(t => t.date === today && t.done).length,
    prayers: Object.values(l.prayers || {}).filter(v => v !== 'manquee').length,
    salle: Boolean(l.salle),
    sessions: d.sessions.length,
  };
}

function onData() {
  const now = snapshot();
  if (last && last.today === now.today) {
    let ev = null;
    if (now.sessions > last.sessions) ev = 'joy_session';
    else if (now.salle && !last.salle) ev = 'joy_gym';
    else if (now.done > last.done) ev = 'joy_task';
    else if (now.prayers > last.prayers) ev = 'joy_prayer';
    if (ev) {
      joyUntil = Date.now() + 90000;
      document.querySelectorAll('.pal-live .orb, #pal-head .orb').forEach(o => react(o, 'joy'));
      say(ev, {}, { face: 'joy' });
    }
  }
  last = now;
  refresh();
}

/* ---------- Démarrage ---------- */

export function startMascot() {
  startLife();
  last = snapshot();
  state = mood();
  renderHead();
  onChange(() => setTimeout(onData, 0));
  setInterval(refresh, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  // toucher la mascotte : elle réagit et dit un mot
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-pal], #pal-head');
    if (!b) return;
    const o = b.querySelector('.orb');
    react(o, state.face === 'neutral' || state.face === 'night' ? 'joy' : state.face);
    say(Math.random() < .5 ? 'tap' : state.key, state.vars, { force: true });
  });
  // bonjour, une fois par jour (le matin) ou au retour
  setTimeout(() => {
    const today = dateKey();
    if (settings().hello !== today && say(new Date().getHours() < 12 ? 'hello_morning' : 'hello_day', {}, { face: 'joy' })) saveSettings({ hello: today });
  }, 1500);
}

export const mascotSettings = settings;
export const setMascot = saveSettings;
export const currentMood = () => state;
