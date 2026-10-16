// Planning en grille horaire : briques proportionnelles, déplacement (appui long),
// redimensionnement (poignée du bas), ligne de l'heure actuelle.

import { esc } from './util.js';
import { toHHMM } from './planning-model.js';

const PX = 1.1;        // pixels par minute
const SNAP = 5;        // pas de 5 min
const HOLD = 350;      // durée de l'appui long (ms)
const MIN_LEN = 10;    // durée minimale d'une brique

// items : éléments du jour (avec start/end en minutes)
// opts : { nowMin, segments, onTap(it), onChange(it, start, end), onPrayer(it) }
export function gridHTML(items, { nowMin = -1, segments = [], conflicts = new Set() } = {}) {
  const bricks = items.filter(i => !i.prayer && i.kind !== 'sommeil' && i.end > i.start);
  const prayers = items.filter(i => i.prayer);
  const all = items.filter(i => i.end >= i.start);
  const from = Math.floor(Math.min(...all.map(i => i.start)) / 60) * 60;
  const to = Math.ceil((Math.max(...all.map(i => i.end)) + 15) / 60) * 60;
  const y = m => (m - from) * PX;
  const cols = layout(bricks);

  let hours = '';
  for (let h = from; h <= to; h += 60) hours += `<div class="g-hour" style="top:${y(h)}px"><span>${toHHMM(h)}</span></div>`;

  const html = bricks.map((it, idx) => {
    const { col, cols: n } = cols.get(it);
    const h = Math.max(22, (it.end - it.start) * PX);
    const movable = it.eid != null || it.taskId;
    const segs = segments.filter(s => it.eid != null && s.block === it.eid && s.kind === 'task');
    const color = it.color ? `--c:${it.color};` : '';
    return `
      <div class="brick k-${it.kind} ${it.optional ? 'optional' : ''} ${it.done ? 'done' : ''} ${it.priority ? `p${it.priority}` : ''} ${movable ? 'movable' : ''} ${h < 40 ? 'tiny' : ''} ${conflicts.has(it) ? 'conflict' : ''}"
        data-i="${idx}" style="${color}top:${y(it.start)}px;height:${h}px;left:calc(${col} * (100% / ${n}));width:calc(100% / ${n} - 4px)">
        <span class="b-time">${toHHMM(it.start)}–${toHHMM(it.end)}</span>
        <span class="b-label">${esc(it.label)}</span>
        ${it.sub && h >= 56 ? `<span class="b-sub">${esc(it.sub)}</span>` : ''}
        ${segs.map(s => `<span class="b-seg p${s.task.priority}" style="top:${(s.start - it.start) * PX}px;height:${Math.max(16, (s.end - s.start) * PX - 2)}px">
          ${esc(s.task.title)}</span>`).join('')}
        ${movable ? '<span class="b-grip" aria-hidden="true"></span>' : ''}
      </div>`;
  }).join('');

  const lines = prayers.map((it, idx) => `
    <button class="g-prayer ${it.deferred ? 'deferred' : ''}" data-p="${idx}" style="top:${y(it.start)}px">
      <span>${it.label} ${toHHMM(it.start)}${it.deferred ? ' · rattrapée' : ''}</span>
    </button>`).join('');

  const now = nowMin >= from && nowMin <= to ? `<div class="g-now" style="top:${y(nowMin)}px"></div>` : '';

  return {
    html: `<div class="grid" style="height:${(to - from) * PX + 20}px">${hours}<div class="g-area">${html}${lines}${now}</div></div>`,
    bricks, prayers, from,
  };
}

// Calcul des colonnes pour les briques qui se chevauchent (comme un agenda).
function layout(bricks) {
  const res = new Map();
  const sorted = [...bricks].sort((a, b) => a.start - b.start || b.end - a.end);
  let group = [], colsEnd = [];
  const flush = () => {
    const n = colsEnd.length;
    group.forEach(it => res.set(it, { col: res.get(it).col, cols: n }));
    group = []; colsEnd = [];
  };
  let groupEnd = -1;
  for (const it of sorted) {
    if (it.start >= groupEnd && group.length) flush();
    let col = colsEnd.findIndex(e => e <= it.start);
    if (col < 0) { col = colsEnd.length; colsEnd.push(it.end); } else colsEnd[col] = it.end;
    res.set(it, { col, cols: 1 });
    group.push(it);
    groupEnd = Math.max(groupEnd, it.end);
  }
  flush();
  return res;
}

// Gestes : toucher = modifier, appui long + glisser = déplacer, poignée = durée.
let ctx = null;   // grille affichée (briques, prières, rappels)
let st = null;    // geste en cours
let windowBound = false;

const point = e => (e.touches ? e.touches[0] : e);

export function bindGrid(root, grid, handlers) {
  const area = root.querySelector('.g-area');
  if (!area) return;
  ctx = { ...grid, ...handlers };

  area.addEventListener('touchstart', start, { passive: true });
  area.addEventListener('touchmove', move, { passive: false });
  area.addEventListener('touchend', e => { if (st) e.preventDefault(); end(); }); // pas de clic simulé ensuite
  area.addEventListener('touchcancel', cancel);
  area.addEventListener('mousedown', e => { if (e.button === 0) start(e); });
  area.addEventListener('contextmenu', e => { if (e.target.closest('.brick')) e.preventDefault(); });
  area.addEventListener('click', e => {
    const p = e.target.closest('.g-prayer');
    if (p) ctx.onPrayer(ctx.prayers[Number(p.dataset.p)]);
  });
  if (!windowBound) {
    windowBound = true;
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', end);
  }
}

function start(e) {
  if (e.target.closest('.g-prayer')) return;
  const el = e.target.closest('.brick');
  if (!el) return;
  const it = ctx.bricks[Number(el.dataset.i)];
  const movable = el.classList.contains('movable');
  const resize = movable && Boolean(e.target.closest('.b-grip'));
  st = { el, it, y0: point(e).clientY, s: it.start, e: it.end, mode: resize ? 'resize' : 'press' };
  if (resize) begin();
  else if (movable) st.timer = setTimeout(() => { if (st?.mode === 'press') { st.mode = 'move'; begin(); } }, HOLD);
}

function begin() {
  st.el.classList.add('dragging');
  document.body.classList.add('no-select');
  navigator.vibrate?.(8);
}

function move(e) {
  if (!st) return;
  const dy = point(e).clientY - st.y0;
  if (st.mode === 'press') {
    if (Math.abs(dy) > 8) { clearTimeout(st.timer); st = null; } // c'est un défilement
    return;
  }
  e.preventDefault();
  const dm = Math.round(dy / PX / SNAP) * SNAP;
  if (st.mode === 'move') {
    st.s = st.it.start + dm;
    st.e = st.it.end + dm;
    st.el.style.top = `${(st.s - ctx.from) * PX}px`;
  } else {
    st.e = Math.max(st.it.start + MIN_LEN, st.it.end + dm);
    st.el.style.height = `${(st.e - st.it.start) * PX}px`;
  }
  st.el.querySelector('.b-time').textContent = `${toHHMM(st.s)}–${toHHMM(st.e)}`;
}

function end() {
  if (!st) return;
  clearTimeout(st.timer);
  const { mode, it, s, e: en, el } = st;
  el.classList.remove('dragging');
  document.body.classList.remove('no-select');
  st = null;
  if (mode === 'press') ctx.onTap(it);
  else if (s !== it.start || en !== it.end) ctx.onChange(it, s, en);
}

function cancel() {
  if (!st) return;
  clearTimeout(st.timer);
  const { el, it } = st;
  el.classList.remove('dragging');
  el.style.top = `${(it.start - ctx.from) * PX}px`;
  el.style.height = `${Math.max(22, (it.end - it.start) * PX)}px`;
  st = null;
}
