// Onglet Stats : score du jour sur 30 jours, essentiels, to-do, répartition de la journée.

import { dateKey, parseKey, fmt, esc } from './util.js';
import { PRAYERS, PRAYER_NAMES } from './prayers.js';
import { scoreSeries, standing, essentialsStats, todoStats, dayShare, averageShare, SHARE, WEIGHT_ESS,
  weekTrends, workHeatmap, estimates, correlations, gradeStats } from './insights.js';
import { getData } from './storage.js';
import { icon } from './icons.js';
import { emptyState } from './empty.js';
import { minutesBySubject, weekRange, fmtMin } from './chrono.js';
import { EXAM_TYPES } from './revision-defaults.js';
import { examName } from './exams-model.js';

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

  const noScore = series.every(d => d.score === null);
  el.innerHTML = `
    ${noScore ? emptyState('Pas encore de score', 'Coche tes prières, saisis tes pas ou termine une tâche : ton score du jour apparaîtra ici, avec tes 30 derniers jours.') : `
    <div class="card hero">
      <div class="hero-top">
        <div>
          <span class="muted small hero-label">${today !== null ? 'Score du jour, en cours' : 'Score du jour'}</span>
          <div class="hero-score">${today ?? '–'}<small>/100</small></div>
        </div>
        <p class="hero-text">${today === null ? 'Remplis tes essentiels ou ta to-do pour obtenir ton score.'
          : st ? `Mieux que <b>${st.pct} %</b> de tes jours.<br>${st.delta >= 0 ? '+' : ''}${st.delta} par rapport à ta moyenne (${st.avg}).`
          : 'Ton premier score : reviens demain pour te comparer.'}</p>
      </div>
      ${scoreChart(series, st)}
      <p class="small muted">Essentiels ${Math.round(WEIGHT_ESS * 100)} % · to-do ${Math.round((1 - WEIGHT_ESS) * 100)} %. Touche une barre pour voir le jour.</p>
    </div>`}

    <a class="card row-link review-link" href="#bilan"><span class="grow"><span class="name">Bilan de la semaine</span>
      <span class="muted small">Résumé, semaines passées, objectif de la semaine prochaine</span></span>${icon('right', 'chev')}</a>
    ${trendsCard()}
    ${heatmapCard()}
    ${subjectsCard()}
    ${estimatesCard()}
    ${correlationsCard()}
    ${gradesCard()}

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
      <div class="tile"><b>${ess.kcalOk}<small>/${ess.kcalDays}</small></b><span>jours dans ta fourchette kcal</span></div>
      <div class="tile"><b>${ess.pasAvg ? fmt(ess.pasAvg) : '—'}</b><span>pas par jour en moyenne</span></div>
      <div class="tile gym-tile"><span class="gym-weeks">${ess.weeks.map((w, i) =>
        `<i class="${w.count >= ess.gymGoal ? 'ok' : ''} ${i === ess.weeks.length - 1 ? 'cur' : ''}" title="Semaine du ${shortDate(w.key)} : ${w.count}/${ess.gymGoal}">${w.count}</i>`).join('')}</span>
        <span>salle / semaine (obj. ${ess.gymGoal})</span></div>
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

  // lecture d'une case de la heatmap
  const heat = el.querySelector('.heatmap');
  const heatOut = el.querySelector('.heat-readout');
  const showHeat = e => {
    const c = e.target.closest('[data-hk]');
    if (!c) return;
    heat.querySelectorAll('.on').forEach(x => x.classList.remove('on'));
    c.classList.add('on');
    heatOut.textContent = `${shortDate(c.dataset.hk)} : ${Number(c.dataset.m) ? fmtMin(Number(c.dataset.m)) : 'rien'}`;
  };
  heat?.addEventListener('pointerdown', showHeat);
  heat?.addEventListener('pointerover', showHeat);

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

/* ---------- E6 ---------- */

function trendsCard() {
  const { n, cur, prev } = weekTrends();
  const rows = [
    ['Heures de travail', cur.work, prev.work, v => fmtMin(Math.round(v)), 60],
    ['Score moyen', cur.score, prev.score, v => Math.round(v), 3],
    ['Prières à l\'heure', cur.prayers, prev.prayers, v => `${Math.round(v * 100)} %`, 0.05],
    ['Pas par jour', cur.pas, prev.pas, v => fmt(Math.round(v)), 500],
    ['Sommeil moyen', cur.sleep, prev.sleep, v => fmtMin(Math.round(v)), 20],
    ['Séances de salle', cur.salle, prev.salle, v => v, 1],
    ['Tâches faites', cur.tasks, prev.tasks, v => v, 1],
  ];
  return `
    <h2 class="section-title">Cette semaine</h2>
    <div class="card trends">
      <p class="small muted">Lundi → aujourd'hui, comparé aux ${n} mêmes jours de la semaine dernière.</p>
      ${rows.map(([l, a, b, f, step]) => {
        const has = a !== null && a !== undefined;
        const d = has && b !== null && b !== undefined ? a - b : null;
        const dir = d === null || Math.abs(d) < step ? 'eq' : d > 0 ? 'up' : 'down';
        return `<div class="trend-row"><span>${l}</span><b class="mono">${has ? f(a) : '—'}</b>
          <span class="trend ${dir}">${d === null ? '' : dir === 'eq' ? '= stable' : `${dir === 'up' ? '▲' : '▼'} ${f(Math.abs(d))}`}</span></div>`;
      }).join('')}
    </div>`;
}

function heatmapCard() {
  const cols = workHeatmap(18);
  const cell = 15, gap = 3, left = 14;
  const lvl = m => (m === null ? 'fut' : !m ? 'h0' : m < 60 ? 'h1' : m < 120 ? 'h2' : m < 240 ? 'h3' : m < 360 ? 'h4' : 'h5');
  const total = cols.flat().reduce((n, c) => n + (c.min || 0), 0);
  const days = cols.flat().filter(c => c.min).length;
  const W = left + cols.length * (cell + gap), H = 7 * (cell + gap);
  return `
    <h2 class="section-title">Heures de travail</h2>
    <div class="card">
      <div class="heat-readout">${total ? `${fmtMin(total)} sur 18 semaines · ${days} jours travaillés` : 'Pas encore de session de chrono'}</div>
      <svg class="heatmap" viewBox="0 0 ${W} ${H}" role="img" aria-label="Heures de travail par jour, 18 dernières semaines">
        ${['L', '', 'M', '', 'V', '', 'D'].map((l, i) => l ? `<text class="sc-axis" x="0" y="${i * (cell + gap) + 11}">${l}</text>` : '').join('')}
        ${cols.map((col, w) => col.map((c, d) => `<rect class="hc ${lvl(c.min)}" ${c.min !== null ? `data-hk="${c.key}" data-m="${c.min}"` : ''}
          x="${left + w * (cell + gap)}" y="${d * (cell + gap)}" width="${cell}" height="${cell}" rx="3.5"/>`).join('')).join('')}
      </svg>
      <div class="heat-legend small muted">Moins ${['h0', 'h1', 'h2', 'h3', 'h4', 'h5'].map(h => `<i class="${h}"></i>`).join('')} Plus
</div>
      <p class="small muted">D'après tes sessions de chrono. Case la plus claire : 6 h ou plus. Touche une case pour voir le jour.</p>
    </div>`;
}

function subjectsCard() {
  const [from, to] = weekRange(dateKey());
  const week = minutesBySubject(from, to);
  const four = minutesBySubject(addDaysKey(from, -21), to);
  const subjects = getData().planning.subjects;
  if (!subjects.length) return '';
  return `
    <h2 class="section-title">Par matière</h2>
    <div class="subj-rings">
      ${subjects.map(s => {
        const m = week[s.id] || 0;
        const goal = (s.weeklyGoal || 0) * 60;
        const ratio = goal ? Math.min(1, m / goal) : (m ? 1 : 0);
        const C = 2 * Math.PI * 26;
        return `
          <div class="subj-ring" style="--sc:${s.color}">
            <svg viewBox="0 0 64 64"><circle class="t" cx="32" cy="32" r="26"/>
              <circle class="v" cx="32" cy="32" r="26" style="stroke-dasharray:${C};stroke-dashoffset:${C * (1 - ratio)}"/></svg>
            <b class="mono">${fmtMin(m)}${goal ? `<small>/${s.weeklyGoal}h</small>` : ''}</b>
            <span>${esc(s.short)}</span>
            <span class="mono">4 sem. ${fmtMin(four[s.id] || 0)}</span>
          </div>`;
      }).join('')}
    </div>
    <p class="small muted note">Cette semaine, par rapport à ton objectif hebdo (Réglages → Matières).</p>`;
}

function addDaysKey(k, n) {
  const d = parseKey(k); d.setDate(d.getDate() + n); return dateKey(d);
}

function estimatesCard() {
  const e = estimates(60);
  if (!e) return `
    <h2 class="section-title">Tes estimations</h2>
    <div class="card"><p class="small muted">Lance le chrono avec une durée prévue (ou depuis une tâche) : l'app comparera le prévu et le réel.</p></div>`;
  const pctOff = Math.round((e.median - 1) * 100);
  const max = Math.max(...e.recent.flatMap(s => [s.minutes, s.planned]));
  return `
    <h2 class="section-title">Tes estimations</h2>
    <div class="card">
      <div class="m-top"><span class="name">${Math.abs(pctOff) <= 10 ? 'Tes estimations sont justes'
        : pctOff > 0 ? `Tu prends ${pctOff} % de temps en plus que prévu` : `Tu finis ${-pctOff} % plus vite que prévu`}</span></div>
      <p class="small muted">${Math.round(e.closeRate * 100)} % des ${e.n} sessions à ±15 % du prévu (60 jours).</p>
      <div class="est-list">${e.recent.map(s => `
        <div class="est-row"><span class="small">${esc(s.label || 'Session')}</span>
          <span class="est-bars"><i class="plan" style="width:${s.planned / max * 100}%"></i><i class="real" style="width:${s.minutes / max * 100}%"></i></span>
          <span class="mono small">${fmtMin(s.minutes)}/${fmtMin(s.planned)}</span></div>`).join('')}</div>
      <div class="stack-legend"><span><i class="est-plan"></i>Prévu</span><span><i class="est-real"></i>Réel</span></div>
    </div>`;
}

function correlationsCard() {
  const rows = correlations(60);
  const ready = rows.filter(r => r.ny >= 3 && r.nn >= 3);
  const waiting = rows.filter(r => r.ny < 3 || r.nn < 3);
  return `
    <h2 class="section-title">Ce qui t'aide</h2>
    <div class="card">
      <p class="small muted">Heures de travail moyennes, selon la journée (60 derniers jours).</p>
      ${ready.length ? '' : emptyState('Pas encore assez de jours', 'Il faut au moins 3 jours « avec » et 3 jours « sans » pour comparer la salle, les pas et le sommeil à tes heures de travail.')}
      ${ready.map(r => {
        const max = Math.max(r.yes, r.no, 1);
        const d = r.no ? Math.round((r.yes - r.no) / r.no * 100) : null;
        return `<div class="cor-row"><span class="name">${r.label}${d !== null ? ` <b class="trend ${d >= 0 ? 'up' : 'down'}">${d >= 0 ? '+' : ''}${d} %</b>` : ''}</span>
          <span class="cor-bar"><span class="small">Oui</span><i class="yes" style="width:${r.yes / max * 100}%"></i><b class="mono small">${fmtMin(r.yes)}</b></span>
          <span class="cor-bar"><span class="small">Non</span><i class="no" style="width:${r.no / max * 100}%"></i><b class="mono small">${fmtMin(r.no)}</b></span></div>`;
      }).join('')}
      ${ready.length && waiting.length ? `<p class="small muted">Bientôt : ${waiting.map(r => r.label.toLowerCase()).join(', ')} (il faut 3 jours avec et 3 sans).</p>` : ''}
      ${ready.length ? '<p class="small muted">Une tendance, pas une preuve : d\'autres choses jouent (cours, examens…).</p>' : ''}
    </div>`;
}

function gradesCard() {
  const { graded, avg } = gradeStats();
  if (!graded.length) return '';
  return `
    <h2 class="section-title">Notes</h2>
    <div class="card">
      <div class="m-top"><span class="name">Moyenne pondérée</span><b class="mono grade-avg">${avg.toFixed(2).replace('.', ',')}/20</b></div>
      <div class="tasks">${graded.map(x => `
        <a class="task row-link" href="#examens/${x.id}">
          <span class="grow"><span class="task-title">${esc(EXAM_TYPES[x.type])} · ${esc(examName(x))}</span>
            <span class="small muted">coef. ${x.coef}${x.readyAtExam !== undefined ? ` · préparation ${Math.round(x.readyAtExam * 100)} %` : ''}</span></span>
          <b class="mono grade">${String(x.grade).replace('.', ',')}/${x.gradeMax}</b>
        </a>`).join('')}</div>
    </div>`;
}
