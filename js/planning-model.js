// Construction d'une journée : type de jour, cours, modèle, prières, réveil et coucher.
// Les heures sont manipulées en minutes depuis minuit.

import { parseKey } from './util.js';
import { prayerTimes, PRAYERS, PRAYER_NAMES } from './prayers.js';

export const DAY_TYPES = {
  bibliotheque: { label: 'Bibliothèque', icon: '📚' },
  cours: { label: 'Cours', icon: '🎓' },
  repos: { label: 'Repos', icon: '🌿' },
};

export const toMin = hhmm => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
export const toHHMM = min => {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

// Créneaux de cours prévus ce jour-là (emploi du temps dont une période couvre la date).
export function courseSlots(p, key) {
  const wd = parseKey(key).getDay();
  for (const c of p.courses) {
    if (c.except.includes(key)) continue;
    if (!c.periods.some(per => key >= per.start && key <= per.end)) continue;
    return c.slots.filter(s => s.day === wd).sort((a, b) => toMin(a.start) - toMin(b.start));
  }
  return [];
}

export function dayType(p, key) {
  return p.days[key]?.type || (courseSlots(p, key).length ? 'cours' : 'bibliotheque');
}

export function restDaysInMonth(p, month) {
  return Object.entries(p.days).filter(([k, d]) => k.startsWith(month) && d.type === 'repos').length;
}

// Horaires de prière du jour, décalages compris.
export function dayPrayers(p, key) {
  const t = prayerTimes(parseKey(key), p.place);
  const out = {};
  for (const name of PRAYERS) out[name] = t[name] + (p.offsets[name] || 0);
  return out;
}

export const KINDS = {
  travail: 'Travail', cours: 'Cours', trajet: 'Trajet', repas: 'Repas',
  repos: 'Repos', routine: 'Routine', perso: 'Perso / sport', priere: 'Prière',
};

const item = (start, end, label, kind, extra = {}) => ({ start, end, label, kind, ...extra });

// Une activité enregistrée (heures "HH:MM") devient un élément de journée (minutes).
const fromStored = a => item(toMin(a.start), toMin(a.end), a.label, a.kind,
  { away: Boolean(a.away), sub: a.sub, color: a.color, optional: a.optional });

// Et inversement, pour figer une journée avant de la modifier.
export const toStored = it => {
  const a = { label: it.label, start: toHHMM(it.start), end: toHHMM(it.end), kind: it.kind };
  for (const k of ['away', 'sub', 'color', 'optional']) if (it[k]) a[k] = it[k];
  return a;
};

function coursDay(p, slots, fajr) {
  const subj = id => p.subjects.find(s => s.id === id) || { short: '?', color: '#888' };
  const c = p.commute.cours;
  const r = p.coursRules;
  const S = toMin(slots[0].start), E = toMin(slots.at(-1).end);
  const out = [
    item(Math.max(S - c - r.prep, fajr + 10), S - c, 'Petit-déjeuner et préparation', 'routine'),
    item(S - c, S, 'Trajet', 'trajet', { away: true }),
  ];
  let lunch = false;
  slots.forEach((s, i) => {
    const sub = subj(s.subject);
    out.push(item(toMin(s.start), toMin(s.end), `${sub.short} · ${s.kind}`, 'cours',
      { away: true, sub: s.room, color: sub.color }));
    const next = slots[i + 1];
    if (!next) return;
    let a = toMin(s.end);
    const b = toMin(next.start);
    if (!lunch && b - a >= r.lunch + 15 && a < 14 * 60 && b > 11 * 60 + 30) {
      out.push(item(a, a + r.lunch, 'Déjeuner', 'repas', { away: true }));
      lunch = true;
      a += r.lunch;
    }
    if (b - a >= 30) out.push(item(a, b, 'Travail sur place', 'travail', { away: true }));
  });

  out.push(item(E, E + c, 'Trajet retour', 'trajet', { away: true }));
  return { items: out, back: E + c, lunch };
}

// Termine la journée après le retour : travail si on rentre tôt, dîner, travail "si retard", repos.
function evening(p, t) {
  const bed = toMin(p.bedtime);
  const { dinner, eveningWork } = p.coursRules;
  const out = [];
  if (t <= 18 * 60) {
    out.push(item(t, 20 * 60, 'Travail', 'travail'));
    t = 20 * 60;
    out.push(item(t, t + dinner, 'Dîner', 'repas'));
    t += dinner;
  } else {
    out.push(item(t, t + dinner, 'Dîner', 'repas'));
    t += dinner;
    const end = Math.min(t + eveningWork, bed - 15);
    if (end - t >= 30) { out.push(item(t, end, 'Travail à la maison (si retard)', 'travail', { optional: true })); t = end; }
  }
  if (bed - t >= 15) out.push(item(t, bed, 'Repos', 'repos'));
  return out;
}

// Activités de base du jour (hors prières, réveil, rattrapage et coucher), dans un ordre stable.
export function baseItems(p, key) {
  const custom = p.days[key]?.items;
  if (custom) return custom.map(fromStored);

  const type = dayType(p, key);
  if (type === 'cours') {
    const pr = dayPrayers(p, key);
    const { items, back, lunch } = coursDay(p, courseSlots(p, key), pr.fajr);
    let t = back + 20; // 20 min réservées au rattrapage des prières
    if (!lunch && t < 14 * 60) { items.push(item(t, t + p.coursRules.lunch, 'Déjeuner', 'repas')); t += p.coursRules.lunch; }
    return [...items, ...evening(p, t)];
  }
  return (p.templates[type] || []).map(fromStored);
}

export function buildDay(p, key) {
  const type = dayType(p, key);
  const pr = dayPrayers(p, key);
  const items = baseItems(p, key).map((it, eid) => ({ ...it, eid }));

  // Prières : rattrapées si elles tombent pendant un moment à l'extérieur (sauf choix contraire du jour).
  const choices = p.days[key]?.prayers || {};
  const awayItems = items.filter(i => i.away);
  const back = awayItems.length ? Math.max(...awayItems.map(i => i.end)) : null;
  const prayers = PRAYERS.map(name => {
    const time = pr[name];
    const outside = awayItems.some(i => time >= i.start && time < i.end);
    const deferred = choices[name] ? choices[name] === 'rattrapage' : outside;
    return item(time, time + 10, PRAYER_NAMES[name], 'priere', { prayer: name, deferred, catchupAt: deferred ? back : null });
  });
  const late = prayers.filter(x => x.deferred);
  if (late.length && back !== null) {
    items.push(item(back, back + 20, 'Rattrapage des prières', 'priere',
      { sub: late.map(x => x.label).join(', ') }));
  }

  const wake = pr.fajr - p.wakeBeforeFajr;
  items.push(item(wake, pr.fajr, 'Réveil · prières surérogatoires', 'priere'));
  items.push(...prayers);
  items.push(item(toMin(p.bedtime), toMin(p.bedtime), 'Coucher', 'sommeil'));

  items.sort((a, b) => a.start - b.start || (a.prayer ? 1 : 0) - (b.prayer ? 1 : 0));
  return { type, items, prayers: pr, wake };
}
