// Widget de bureau (app Mac) : bloc en cours, prochaine tâche, chrono, prochaine prière, mascotte.

import { getData, update, onChange } from './storage.js';
import { dateKey, esc } from './util.js';
import { buildDay, toHHMM } from './planning-model.js';
import { PRAYERS, PRAYER_NAMES } from './prayers.js';
import { schedule } from './scheduler.js';
import { running, elapsedMs, pause, resume, fmtClock } from './chrono.js';
import { orb, startLife, react } from './orb.js';
import { mood } from './mascot.js';

const T = window.__TAURI__;
const me = T?.webviewWindow.getCurrentWebviewWindow();
const el = document.getElementById('w');
const prefs = () => ({ widgetPinned: true, ...getData().settings.desktop });
const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
const inMin = m => (m < 60 ? `dans ${m} min` : `dans ${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`);

function info() {
  const d = getData(), p = d.planning, today = dateKey(), m = nowMin();
  const built = buildDay(p, today);
  const block = built.items.find(i => !i.prayer && i.kind !== 'sommeil' && i.start <= m && m < i.end);
  const next = built.items.find(i => !i.prayer && i.kind !== 'sommeil' && i.start > m);
  const sched = schedule(p, d.tasks, today, built);
  const seg = sched.segments.filter(s => s.kind === 'task' && s.end > m && !s.task.done).sort((a, b) => a.start - b.start)[0];
  const task = seg?.task || d.tasks.filter(t => t.date === today && !t.done).sort((a, b) => b.priority - a.priority)[0];
  const pr = PRAYERS.map(n => [n, built.prayers[n]]).find(([, t]) => t > m);
  return { block, next, task, seg, prayer: pr && { name: PRAYER_NAMES[pr[0]], at: pr[1], in: pr[1] - m } };
}

let lastFace = null;
function render() {
  const x = info();
  const c = running();
  const face = mood().face;
  const pinned = prefs().widgetPinned;
  el.innerHTML = `
    <header class="w-top" data-tauri-drag-region>
      <span class="w-orb" data-act="open" title="Ouvrir Quotidien">${orb(40, face)}</span>
      <span class="w-title" data-tauri-drag-region><b>Quotidien</b><small>${new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</small></span>
      <button class="w-pin ${pinned ? 'on' : ''}" data-act="pin" title="${pinned ? 'Ne plus garder au premier plan' : 'Garder au premier plan'}">${pinned ? 'épinglé' : 'épingler'}</button>
    </header>
    <div class="w-row"><span>Maintenant</span><b>${x.block ? `${esc(x.block.label)} · jusqu'à ${toHHMM(x.block.end)}` : x.next ? `Libre · ${esc(x.next.label)} à ${toHHMM(x.next.start)}` : 'Fin de journée'}</b></div>
    <div class="w-row"><span>Tâche</span><b>${x.task ? esc(x.task.title) + (x.seg && x.seg.start > nowMin() ? ` · ${toHHMM(x.seg.start)}` : '') : 'Rien en attente'}</b></div>
    <div class="w-row chrono"><span>Chrono</span>${c ? `<b class="w-clock" data-clock>${fmtClock(elapsedMs(c))}</b>
      <button class="w-btn" data-act="${c.paused ? 'resume' : 'pause'}" aria-label="${c.paused ? 'Reprendre' : 'Pause'}">${c.paused ? '▶' : '❚❚'}</button>` : '<b class="muted">à l\'arrêt</b>'}</div>
    <div class="w-row"><span>Prière</span><b>${x.prayer ? `${x.prayer.name} à ${toHHMM(x.prayer.at)} · ${inMin(x.prayer.in)}` : 'Fajr demain'}</b></div>`;
  if (lastFace && lastFace !== face) react(el.querySelector('.orb'), face);
  lastFace = face;
}

el.addEventListener('click', async e => {
  const a = e.target.closest('[data-act]')?.dataset.act;
  if (!a) return;
  if (a === 'pause') pause();
  if (a === 'resume') resume();
  if (a === 'open') T?.core.invoke('show_main');
  if (a === 'pin') {
    const on = !prefs().widgetPinned;
    update(d => { d.settings.desktop = { ...prefs(), widgetPinned: on }; });
    await me?.setAlwaysOnTop(on);
  }
  render();
});

// le chrono avance chaque seconde ; le reste chaque minute ou quand les données changent
setInterval(() => {
  const c = running();
  const clock = el.querySelector('[data-clock]');
  if (c && clock) clock.textContent = fmtClock(elapsedMs(c));
}, 1000);
setInterval(render, 30000);
onChange(() => render());
me?.setAlwaysOnTop(prefs().widgetPinned).catch(() => {});
startLife();
render();
