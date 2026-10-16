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

const item = (start, end, label, kind, extra = {}) => ({ start, end, label, kind, ...extra });

function coursDay(p, slots, fajr) {
  const subj = id => p.subjects.find(s => s.id === id) || { short: '?', color: '#888' };
  const c = p.commute.cours;
  const S = toMin(slots[0].start), E = toMin(slots.at(-1).end);
  const out = [
    item(Math.max(S - c - 45, fajr + 10), S - c, 'Petit-déjeuner et préparation', 'routine'),
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
    if (!lunch && b - a >= 60 && a < 14 * 60 && b > 11 * 60 + 30) {
      out.push(item(a, a + 45, 'Déjeuner', 'repas', { away: true }));
      lunch = true;
      a += 45;
    }
    if (b - a >= 30) out.push(item(a, b, 'Travail sur place', 'travail', { away: true }));
  });

  out.push(item(E, E + c, 'Trajet retour', 'trajet', { away: true }));
  return { items: out, back: E + c, lunch };
}

// Termine la journée après le retour : travail si on rentre tôt, dîner, travail "si retard", repos.
function evening(p, t) {
  const bed = toMin(p.bedtime);
  const out = [];
  if (t <= 18 * 60) {
    out.push(item(t, 20 * 60, 'Travail', 'travail'));
    t = 20 * 60;
    out.push(item(t, t + 45, 'Dîner', 'repas'));
    t += 45;
  } else {
    out.push(item(t, t + 45, 'Dîner', 'repas'));
    t += 45;
    const end = Math.min(t + 120, bed - 15);
    if (end - t >= 30) { out.push(item(t, end, 'Travail à la maison (si retard)', 'travail', { optional: true })); t = end; }
  }
  if (bed - t >= 15) out.push(item(t, bed, 'Repos', 'repos'));
  return out;
}

export function buildDay(p, key) {
  const type = dayType(p, key);
  const pr = dayPrayers(p, key);
  let items = [];

  if (type === 'cours') {
    const { items: its, back, lunch } = coursDay(p, courseSlots(p, key), pr.fajr);
    items = its;
    let t = back + 20; // 20 min réservées au rattrapage des prières
    if (!lunch && t < 14 * 60) { items.push(item(t, t + 45, 'Déjeuner', 'repas')); t += 45; }
    items.push(...evening(p, t));
  } else {
    items = (p.templates[type] || []).map(a => item(toMin(a.start), toMin(a.end), a.label, a.kind,
      { away: type === 'bibliotheque' && ['trajet', 'travail'].includes(a.kind) || a.label === 'Déjeuner' && type === 'bibliotheque' }));
  }

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
