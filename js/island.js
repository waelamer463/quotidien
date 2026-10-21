// Dynamic island (app Mac) : une pastille en haut au centre de l'écran.
//   repos   : mascotte + info clé (chrono, ou prochaine prière / bloc)
//   événement : s'agrandit quelques secondes (début / fin de bloc, prière, pause, prière à cocher)
//   ouverte : au clic, actions rapides (pause / reprise, tâche faite, ouvrir l'app)
// La fenêtre est redimensionnée à chaque état : elle ne bloque jamais les clics autour.

import { getData, update, onChange } from './storage.js';
import { dateKey, esc } from './util.js';
import { buildDay, toHHMM } from './planning-model.js';
import { PRAYERS, PRAYER_NAMES } from './prayers.js';
import { schedule } from './scheduler.js';
import { running, elapsedMs, pause, resume, fmtClock } from './chrono.js';
import { dayLog, cyclePrayer } from './essentials.js';
import { orb, react, startLife } from './orb.js';
import { mood } from './mascot.js';

const T = window.__TAURI__;
const isl = document.getElementById('isl');
const SIZES = { rest: [236, 44], event: [440, 92], open: [460, 178] };
let mode = 'rest';
let evTimer = null;
let currentEvent = null;
const seen = new Set();

const frame = ([w, h]) => T?.core.invoke('island_frame', { w, h }).catch(() => {});
const wait = ms => new Promise(r => setTimeout(r, ms));
const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
const inMin = m => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`);

async function setMode(next) {
  if (next === mode) return;
  const grow = SIZES[next][0] * SIZES[next][1] > SIZES[mode][0] * SIZES[mode][1];
  if (grow) { await frame(SIZES[next]); await wait(16); }
  mode = next;
  isl.className = `island ${next}`;
  if (!grow) { await wait(420); if (mode === next) frame(SIZES[next]); }
}

/* ---------- Infos du moment ---------- */

function info() {
  const d = getData(), p = d.planning, today = dateKey(), m = nowMin();
  const built = buildDay(p, today);
  const items = built.items.filter(i => !i.prayer && !['sommeil', 'priere'].includes(i.kind) && i.end > i.start);
  const block = items.find(i => i.start <= m && m < i.end);
  const next = items.find(i => i.start > m);
  const sched = schedule(p, d.tasks, today, built);
  const seg = sched.segments.filter(s => s.kind === 'task' && s.end > m && !s.task.done).sort((a, b) => a.start - b.start)[0];
  const task = seg?.task || d.tasks.filter(t => t.date === today && !t.done).sort((a, b) => b.priority - a.priority)[0];
  const prayers = built.items.filter(i => i.prayer);
  const nextPrayer = prayers.find(i => i.start > m);
  return { p, today, m, built, block, next, task, prayers, nextPrayer };
}

function restHTML(x) {
  const c = running();
  const sub = getData().planning.subjects.find(s => s.id === c?.subject);
  const text = c ? `<span>${esc(c.label || sub?.short || 'Chrono')}</span><b class="t" data-clock>${fmtClock(elapsedMs(c))}</b>`
    : x.nextPrayer && x.nextPrayer.start - x.m <= 90 ? `<span>${x.nextPrayer.label}</span><b class="t">${inMin(x.nextPrayer.start - x.m)}</b>`
    : x.block ? `<span>${esc(x.block.label)}</span><b class="t">${toHHMM(x.block.end)}</b>`
    : `<span>${new Date().toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' })}</span><b class="t">${toHHMM(x.m)}</b>`;
  return `${orb(26, mood().face)}${text}`;
}

function openHTML(x) {
  const c = running();
  return `
    <div class="io-top">${orb(48, mood().face)}
      <div class="io-main"><b>${x.block ? esc(x.block.label) : 'Temps libre'}</b>
        <small>${x.block ? `jusqu'à ${toHHMM(x.block.end)}` : x.next ? `${esc(x.next.label)} à ${toHHMM(x.next.start)}` : 'Fin de journée'}${x.task ? ` · ${esc(x.task.title)}` : ''}</small></div>
      ${c ? `<span class="io-clock" data-clock>${fmtClock(elapsedMs(c))}</span>` : ''}
    </div>
    <div class="io-acts">
      ${c ? `<button class="main" data-act="${c.paused ? 'resume' : 'pause'}">${c.paused ? '▶ Reprendre' : '❚❚ Pause'}</button>` : '<button data-act="app">▶ Chrono</button>'}
      <button data-act="done" ${x.task ? '' : 'disabled'}>✓ Tâche faite</button>
      <button data-act="app">Ouvrir</button>
    </div>
    <div class="io-foot"><span>${x.nextPrayer ? `${x.nextPrayer.label} à ${toHHMM(x.nextPrayer.start)}` : 'Fajr demain'}</span>
      <span>${x.next ? `Ensuite : ${esc(x.next.label)} ${toHHMM(x.next.start)}` : ''}</span></div>`;
}

function render() {
  const x = info();
  document.getElementById('rest').innerHTML = restHTML(x);
  if (mode === 'open') document.getElementById('open').innerHTML = openHTML(x);
}

/* ---------- Événements ---------- */

function showEvent(ev) {
  currentEvent = ev;
  document.getElementById('ev').innerHTML = `${orb(52, ev.face)}
    <div class="ie-text"><b>${esc(ev.title)}</b><small>${esc(ev.sub || '')}</small></div>
    ${ev.action ? `<button class="ie-act" data-act="ev">${esc(ev.action)}</button>` : ''}`;
  setMode('event');
  react(document.querySelector('#ev .orb'), ev.face);
  clearTimeout(evTimer);
  evTimer = setTimeout(() => { if (mode === 'event') setMode('rest'); }, ev.action ? 9000 : 5500);
}

function check() {
  if (getData().settings.desktop?.island === false || mode === 'open') return;
  const x = info();
  const key = id => `${x.today}:${id}`;
  const fire = (id, ev) => { if (seen.has(key(id))) return false; seen.add(key(id)); showEvent(ev); return true; };

  // début de bloc (dans la minute)
  if (x.block && x.m - x.block.start <= 1 && fire(`start:${x.block.start}`, { face: 'joy', title: `C'est parti : ${x.block.label}`, sub: `jusqu'à ${toHHMM(x.block.end)}` })) return;
  // fin de bloc dans 5 min
  if (x.block && x.block.end - x.m <= 5 && x.block.end - x.m > 0 && fire(`end:${x.block.end}`, { face: 'rappel', title: `Fin de ${x.block.label} à ${toHHMM(x.block.end)}`, sub: x.next ? `Ensuite : ${x.next.label}` : 'Fin de journée' })) return;
  // prière dans 10 min
  const soon = x.prayers.find(i => !i.deferred && i.start - x.m > 0 && i.start - x.m <= 10);
  if (soon && fire(`pr:${soon.prayer}`, { face: 'rappel', title: `${soon.label} dans ${soon.start - x.m} min`, sub: 'Prépare-toi pour la prière' })) return;
  // prière passée depuis 20 min et pas cochée
  const l = dayLog(x.today);
  const missed = x.prayers.find(i => !i.deferred && x.m - i.start >= 20 && x.m - i.start <= 90 && !l.prayers?.[i.prayer]);
  if (missed && fire(`ck:${missed.prayer}`, { face: 'neutral', title: `As-tu prié ${missed.label} ?`, sub: `à ${toHHMM(missed.start)}`, action: '✓ C\'est fait', do: () => cyclePrayer(x.today, missed.prayer, false) })) return;
  // pause : chrono lancé sans interruption depuis la durée d'une session
  const c = running();
  if (c && !c.paused) {
    const run = Math.floor((Date.now() - c.startedAt) / 60000);
    const every = x.p.focus.session;
    if (run >= every) fire(`pause:${c.startedAt}:${Math.floor(run / 30)}`, { face: 'rappel', title: `Pause de ${x.p.focus.pause} min ?`, sub: `Tu travailles depuis ${inMin(run)}`, action: '❚❚ Pause', do: () => pause() });
  }
}

/* ---------- Clics ---------- */

isl.addEventListener('click', async e => {
  const a = e.target.closest('[data-act]')?.dataset.act;
  if (a === 'ev') { currentEvent?.do?.(); react(document.querySelector('#ev .orb'), 'joy'); setTimeout(() => setMode('rest'), 600); return; }
  if (a === 'pause') pause();
  else if (a === 'resume') resume();
  else if (a === 'app') { T?.core.invoke('show_main'); setMode('rest'); return; }
  else if (a === 'done') {
    const t = info().task;
    if (t) update(d => { const x = d.tasks.find(y => y.id === t.id); x.done = true; x.doneAt = new Date().toISOString(); });
  } else if (!a) {
    if (mode === 'open') { setMode('rest'); return; }
    document.getElementById('open').innerHTML = openHTML(info());
    clearTimeout(evTimer);
    await setMode('open');
    return;
  }
  render();
});
window.addEventListener('blur', () => { if (mode === 'open') setMode('rest'); });

setInterval(() => {
  const c = running();
  if (c) document.querySelectorAll('[data-clock]').forEach(x => { x.textContent = fmtClock(elapsedMs(c)); });
}, 1000);
setInterval(() => { render(); check(); }, 15000);
onChange(() => render());
startLife();
frame(SIZES.rest);
render();
setTimeout(check, 2000);
