// Composants d'affichage des statistiques (chaînes HTML + SVG fait main, sans librairie).

import { dateKey, addDays, parseKey, fmt, esc } from './util.js';
import { goalLabel } from './habits-model.js';
import { dayResult, currentStreak, bestStreak, successRate, dayScore } from './stats.js';

const pct = r => (r === null ? '–' : `${Math.round(r * 100)} %`);
const shortDate = k => parseKey(k).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });

function tile(value, label) {
  return `<div class="tile"><b>${value}</b><span>${label}</span></div>`;
}

/* ---------- Bilan global ---------- */

export function overviewTiles(habits, entries) {
  const best = Math.max(0, ...habits.map(h => currentStreak(h, entries)));
  return `<div class="tiles">
    ${tile(pct(successRate(habits, entries, 7)), 'réussite 7 jours')}
    ${tile(pct(successRate(habits, entries, 30)), 'réussite 30 jours')}
    ${tile(`${best} j`, 'meilleure série en cours')}
  </div>`;
}

// Calendrier du mois : chaque case = part des objectifs atteints ce jour-là.
export function globalCalendar(habits, entries, month = dateKey().slice(0, 7)) {
  return calendar(month, k => {
    const { done, total } = dayScore(habits, entries, k);
    if (!total) return { cls: 'none' };
    const level = Math.round((done / total) * 4);
    return { cls: `lv${level}`, title: `${done}/${total} objectifs` };
  }) + `<div class="legend scale"><span>0 %</span>${[0, 1, 2, 3, 4].map(l => `<i class="lv${l}"></i>`).join('')}<span>100 %</span></div>`;
}

/* ---------- Une habitude ---------- */

export function habitTiles(h, entries) {
  return `<div class="tiles four">
    ${tile(`${currentStreak(h, entries)} j`, 'série en cours')}
    ${tile(`${bestStreak(h, entries)} j`, 'record')}
    ${tile(pct(successRate([h], entries, 7)), '7 jours')}
    ${tile(pct(successRate([h], entries, 30)), '30 jours')}
  </div>`;
}

const GLYPH = { done: '✓', over: '!', todo: '', pending: '' };

export function habitCalendar(h, entries, month = dateKey().slice(0, 7)) {
  return calendar(month, k => {
    const r = dayResult(h, entries, k);
    return r ? { cls: r, glyph: GLYPH[r] } : { cls: 'none' };
  }) + `<div class="legend">
    <span><i class="done">✓</i> Réussi</span>
    ${['max', 'range'].includes(h.type) ? '<span><i class="over">!</i> Dépassé</span>' : ''}
    <span><i class="todo"></i> Manqué</span>
  </div>`;
}

function calendar(month, cell) {
  const first = parseKey(`${month}-01`);
  const offset = (first.getDay() + 6) % 7; // lundi = 0
  const count = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const title = first.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  let cells = '<span class="pad"></span>'.repeat(offset);
  for (let d = 1; d <= count; d++) {
    const k = `${month}-${String(d).padStart(2, '0')}`;
    const c = cell(k);
    cells += `<span class="day ${c.cls}" ${c.title ? `title="${c.title}"` : ''}>
      <small>${d}</small>${c.glyph ? `<em>${c.glyph}</em>` : ''}</span>`;
  }
  return `<div class="cal">
    <div class="cal-title">${title.charAt(0).toUpperCase() + title.slice(1)}</div>
    <div class="cal-grid">${['L', 'M', 'M', 'J', 'V', 'S', 'D'].map(l => `<span class="wd">${l}</span>`).join('')}${cells}</div>
  </div>`;
}

// Barres des 30 derniers jours, colorées selon le résultat, avec la zone d'objectif.
export function habitChart(h, entries, days = 30) {
  const today = dateKey();
  const pts = [];
  for (let i = days - 1; i >= 0; i--) {
    const k = addDays(today, -i);
    const r = dayResult(h, entries, k, today);
    pts.push({ k, r, v: r ? entries[k]?.[h.id] ?? 0 : null });
  }
  const vals = pts.filter(p => p.v !== null).map(p => p.v);
  let avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  avg = avg >= 100 ? Math.round(avg) : Math.round(avg * 10) / 10;
  const top = Math.max(...vals, h.max ?? 0, h.min ?? 0) * 1.12 || 1;

  const W = 340, H = 170, L = 4, R = 44, T = 8, B = 22;
  const pw = W - L - R, ph = H - T - B;
  const y = v => T + ph - (v / top) * ph;
  const slot = pw / days, bw = Math.max(2, slot - 2);
  const unit = h.unit ? ` ${esc(h.unit)}` : '';

  const goal = [];
  if (h.type === 'range') goal.push(`<rect class="band" x="${L}" y="${y(h.max)}" width="${pw}" height="${y(h.min) - y(h.max)}"/>`);
  for (const v of [h.min, h.max].filter(v => v != null)) {
    goal.push(`<line class="goal" x1="${L}" x2="${L + pw}" y1="${y(v)}" y2="${y(v)}"/>
      <text class="axis" x="${L + pw + 6}" y="${y(v) + 4}">${fmt(v)}</text>`);
  }

  const bars = pts.map((p, i) => {
    const x = L + i * slot + 1;
    if (p.v === null) return '';
    const yt = y(p.v), hgt = T + ph - yt;
    const rad = Math.min(2, hgt / 2);
    const d = hgt <= 0 ? '' :
      `M${x},${T + ph}V${yt + rad}q0,-${rad} ${rad},-${rad}h${bw - 2 * rad}q${rad},0 ${rad},${rad}V${T + ph}Z`;
    const label = `${shortDate(p.k)} : ${fmt(p.v)}${unit}`;
    return `<path class="bar-${p.r}" d="${d}"/>
      <rect class="hit" x="${L + i * slot}" y="${T}" width="${slot}" height="${ph}" data-label="${label}" data-i="${i}"/>`;
  }).join('');

  const xl = [0, Math.floor(days / 2), days - 1].map(i =>
    `<text class="axis" x="${L + i * slot + slot / 2}" y="${H - 6}" text-anchor="middle">${parseKey(pts[i].k).toLocaleDateString('fr-FR', { day: 'numeric', month: 'numeric' })}</text>`).join('');

  return `<div class="chart" data-default="Moyenne : ${fmt(avg)}${unit} / jour">
    <div class="readout">Moyenne : ${fmt(avg)}${unit} / jour</div>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(h.name)}, ${days} derniers jours. Objectif ${esc(goalLabel(h))}.">
      <line class="base" x1="${L}" x2="${L + pw}" y1="${T + ph}" y2="${T + ph}"/>
      ${goal.join('')}${bars}${xl}
    </svg>
  </div>`;
}

// Toucher / survoler une barre affiche sa valeur au-dessus du graphique.
export function bindCharts(root) {
  root.addEventListener('pointerover', show);
  root.addEventListener('pointerdown', show);
  // À la souris, on revient à la moyenne en quittant le graphique ; au doigt, la valeur reste affichée.
  root.addEventListener('pointerout', e => {
    const c = e.target.closest?.('.chart');
    if (c && e.pointerType === 'mouse' && !c.contains(e.relatedTarget)) reset(c);
  });

  function show(e) {
    const hit = e.target.closest?.('.hit');
    if (!hit) return;
    const chart = hit.closest('.chart');
    chart.querySelector('.readout').textContent = hit.dataset.label;
    chart.querySelectorAll('.hit.on').forEach(x => x.classList.remove('on'));
    hit.classList.add('on');
  }
  function reset(c) {
    c.querySelector('.readout').textContent = c.dataset.default;
    c.querySelectorAll('.hit.on').forEach(x => x.classList.remove('on'));
  }
}
