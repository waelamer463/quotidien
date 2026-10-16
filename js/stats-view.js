// Onglet Stats : score du jour sur 30 jours, essentiels, to-do, répartition de la journée.

import { dateKey, parseKey, fmt, esc } from './util.js';
import { PRAYERS, PRAYER_NAMES } from './prayers.js';
import { scoreSeries, standing, essentialsStats, todoStats, dayShare, averageShare, SHARE, WEIGHT_ESS } from './insights.js';

const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const hours = m => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? String(m % 60).padStart(2, '0') : ''}` : `${m} min`);
const shortDate = k => parseKey(k).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });

export function render(el) {
  const series = scoreSeries(30);
  const st = standing(series);
  const today = series.at(-1).score;
  const ess = essentialsStats(30);
  const todo = todoStats(30);
  const shareToday = dayShare(dateKey());
  const shareAvg = averageShare(30);

  el.innerHTML = `
    <div class="card hero">
      <div class="hero-top">
        <div>
          <span class="muted small">Score du jour${today !== null ? ' · en cours' : ''}</span>
          <div class="hero-score">${today ?? '—'}<small>/100</small></div>
        </div>
        <p class="hero-text">${today === null ? 'Remplis tes essentiels ou ta to-do pour obtenir ton score.'
          : st ? `Mieux que <b>${st.pct} %</b> de tes jours.<br>${st.delta >= 0 ? '+' : ''}${st.delta} par rapport à ta moyenne (${st.avg}).`
          : 'Ton premier score : reviens demain pour te comparer.'}</p>
      </div>
      ${scoreChart(series, st)}
      <p class="small muted">Essentiels ${Math.round(WEIGHT_ESS * 100)} % · to-do ${Math.round((1 - WEIGHT_ESS) * 100)} %. Touche une barre pour voir le jour.</p>
    </div>

    <h2 class="section-title">Essentiels sur 30 jours</h2>
    <div class="card">
      <div class="m-top"><span class="name">Prières</span><span class="muted small">${ess.logged} notées</span></div>
      ${stack([
        ['ok', 'À l\'heure', ess.totals.heure], ['warm', 'Rattrapées', ess.totals.rattrapee], ['bad', 'Manquées', ess.totals.manquee],
      ], ess.logged)}
      <div class="per-prayer">
        ${PRAYERS.map(p => {
          const x = ess.perPrayer[p]; const n = x.heure + x.rattrapee + x.manquee;
          return `<div><b>${n ? pct(x.heure, n) : '–'}${n ? ' %' : ''}</b><span>${PRAYER_NAMES[p]}</span></div>`;
        }).join('')}
      </div>
      <p class="small muted">${ess.worst ? `<b>${PRAYER_NAMES[ess.worst]}</b> est la prière que tu rattrapes ou manques le plus.` : 'Pourcentage de prières à l\'heure, par prière.'}</p>
    </div>
    <div class="tiles">
      <div class="tile"><b>${ess.kcalOk}<small>/${ess.kcalDays}</small></b><span>jours dans ta fourchette de calories</span></div>
      <div class="tile"><b>${ess.pasAvg ? fmt(ess.pasAvg) : '—'}</b><span>pas en moyenne · ${ess.pasOk} jours à l'objectif</span></div>
      <div class="tile gym-tile"><span class="gym-weeks">${ess.weeks.map((w, i) =>
        `<i class="${w.count >= ess.gymGoal ? 'ok' : ''} ${i === ess.weeks.length - 1 ? 'cur' : ''}" title="Semaine du ${shortDate(w.key)} : ${w.count}/${ess.gymGoal}">${w.count}</i>`).join('')}</span>
        <span>salle par semaine (objectif ${ess.gymGoal})</span></div>
    </div>

    <h2 class="section-title">To-do sur 30 jours</h2>
    <div class="tiles four">
      <div class="tile"><b>${todo.done}<small>/${todo.planned}</small></b><span>tâches faites (${pct(todo.done, todo.planned)} %)</span></div>
      <div class="tile"><b>${hours(todo.doneMin)}</b><span>de tâches terminées</span></div>
      <div class="tile"><b>${todo.postponed}</b><span>tâches reportées au moins une fois</span></div>
      <div class="tile ${todo.late ? 'warn' : ''}"><b>${todo.late}</b><span>en retard aujourd'hui</span></div>
    </div>
    ${todo.urgentRate !== null ? `<p class="small muted note">${Math.round(todo.urgentRate * 100)} % de tes tâches urgentes ont été faites le jour prévu.</p>` : ''}

    <h2 class="section-title">Ta journée</h2>
    <div class="card">
      <div class="share-row"><span class="small muted">Aujourd'hui</span>${shareBar(shareToday)}</div>
      <div class="share-row"><span class="small muted">Moyenne 30 j</span>${shareBar(shareAvg)}</div>
      <table class="share-legend">
        <thead><tr><th></th><th>Aujourd'hui</th><th>Moyenne</th></tr></thead>
        <tbody>${SHARE.map(([k, l], i) => `
          <tr><td><i class="sw s${i + 1}"></i>${l}</td><td>${hours(shareToday[k])}</td><td>${hours(shareAvg[k])}</td></tr>`).join('')}</tbody>
      </table>
      <p class="small muted">D'après ton planning (prévu), hors repos et temps libre.</p>
    </div>`;

  // lecture d'une barre du score
  const chart = el.querySelector('.score-chart');
  const readout = el.querySelector('.score-readout');
  chart?.addEventListener('pointerdown', show);
  chart?.addEventListener('pointerover', show);
  function show(e) {
    const hit = e.target.closest('[data-k]');
    if (!hit) return;
    chart.querySelectorAll('.on').forEach(x => x.classList.remove('on'));
    hit.classList.add('on');
    const s = series.find(d => d.key === hit.dataset.k);
    readout.textContent = `${shortDate(s.key)} : ${s.score ?? 'pas de données'}`;
  }
}

function scoreChart(series, st) {
  const W = 340, H = 140, B = 18, R = 34;
  const pw = W - R, ph = H - B;
  const slot = pw / series.length, bw = slot - 2;
  const y = v => ph - (v / 100) * ph;
  const bars = series.map((d, i) => {
    const x = i * slot + 1;
    const isToday = i === series.length - 1;
    const mark = d.score === null
      ? `<circle cx="${x + bw / 2}" cy="${ph - 2}" r="1.6" class="sc-none"/>`
      : `<path class="${isToday ? 'sc-today' : 'sc-bar'}" d="M${x},${ph}V${y(d.score) + 2}q0,-2 2,-2h${bw - 4}q2,0 2,2V${ph}Z"/>`;
    return `${mark}<rect class="sc-hit" data-k="${d.key}" x="${i * slot}" y="0" width="${slot}" height="${ph}"/>`;
  }).join('');
  const avg = st ? `<line class="sc-avg" x1="0" x2="${pw}" y1="${y(st.avg)}" y2="${y(st.avg)}"/>
    <text class="sc-axis" x="${pw + 4}" y="${y(st.avg) + 4}">moy. ${st.avg}</text>` : '';
  const lab = i => `<text class="sc-axis" x="${i * slot + slot / 2}" y="${H - 4}" text-anchor="middle">${parseKey(series[i].key).toLocaleDateString('fr-FR', { day: 'numeric', month: 'numeric' })}</text>`;
  return `
    <div class="score-readout">30 derniers jours</div>
    <svg class="score-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Score des 30 derniers jours">
      <line class="sc-base" x1="0" x2="${pw}" y1="${ph}" y2="${ph}"/>
      ${bars}${avg}
      ${lab(0)}${lab(14)}<text class="sc-axis sc-today-lab" x="${(series.length - 1) * slot + slot / 2}" y="${H - 4}" text-anchor="middle">auj.</text>
    </svg>`;
}

function stack(parts, total) {
  if (!total) return '<p class="small muted">Aucune prière notée pour l\'instant.</p>';
  return `
    <div class="stack">${parts.filter(p => p[2]).map(([c, l, n]) =>
      `<i class="${c}" style="flex:${n}" title="${l} : ${n}"></i>`).join('')}</div>
    <div class="stack-legend">${parts.map(([c, l, n]) =>
      `<span><i class="${c}"></i>${l} <b>${pct(n, total)} %</b></span>`).join('')}</div>`;
}

function shareBar(share) {
  const total = Object.values(share).reduce((a, b) => a + b, 0);
  if (!total) return '<div class="share empty"></div>';
  return `<div class="share">${SHARE.map(([k, l], i) => share[k]
    ? `<i class="s${i + 1}" style="flex:${share[k]}" title="${esc(l)} : ${hours(share[k])}"></i>` : '').join('')}</div>`;
}
