// To-do : modèle, ajout rapide en langage naturel, tâches répétées.
//
// Tâche : { id, title, date, start, end, duration, priority (1 normale · 2 importante · 3 urgente),
//           deadline, subject, done, doneAt, postponed, seriesId, created }
//   - "bloc horaire" : start + end  → posé tel quel dans le planning
//   - "avec durée"   : duration     → placé automatiquement dans les temps de travail
//   - "simple"       : ni l'un ni l'autre → reste dans la liste
// Série répétée (data.series) : { id, title, start, end, duration, priority, subject,
//           rule: { type: 'day'|'week', days: [0..6], interval }, from, until, skip: [dates] }

import { getData, update } from './storage.js';
import { dateKey, addDays, parseKey, uid } from './util.js';

export const PRIORITY = { 1: 'Normale', 2: 'Importante', 3: 'Urgente' };
const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const pad = n => String(n).padStart(2, '0');
const hm = (h, m = 0) => `${pad(h)}:${pad(m)}`;
const toMin = s => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };

export function kindOf(t) {
  return t.start && t.end ? 'bloc' : t.duration ? 'duree' : 'simple';
}

/* ---------- Ajout rapide ---------- */

// "Travailler 3h de 14h à 17h demain !!" → { title, date, start, end, duration, priority, ... }
export function parseQuick(input, ref = dateKey(), subjects = []) {
  let s = ` ${input.trim()} `;
  const out = { priority: 1 };
  const take = (re, fn) => { const m = s.match(re); if (m) { fn(m); s = s.replace(m[0], ' '); } return m; };

  // priorité : "!!" ou "urgent" = urgente, "!" ou "important" = importante
  take(/\s(!{2,}|urgente?)(?=\s)/i, () => { out.priority = 3; });
  take(/\s(!|importante?)(?=\s)/i, () => { out.priority = Math.max(out.priority, 2); });

  // répétition
  take(/\s(chaque jour|tous les jours)(?=\s)/i, () => { out.rule = { type: 'day', interval: 1 }; });
  take(/\s(?:chaque|tous les)\s+((?:(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)s?(?:\s*(?:,|et)\s*)?)+)(?=\s)/i, m => {
    const days = [...m[1].toLowerCase().matchAll(/lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche/g)].map(x => DAYS.indexOf(x[0]));
    out.rule = { type: 'week', days, interval: 1 };
  });
  take(/\s(?:chaque semaine|toutes les semaines)(?=\s)/i, () => { out.rule = { type: 'week', days: null, interval: 1 }; });
  take(/\stoutes les (\d+) semaines(?=\s)/i, m => { out.rule = { type: 'week', days: null, interval: Number(m[1]) }; });

  // échéance : "pour vendredi", "avant le 25"
  take(/\s(?:pour|avant)\s+(?:le\s+)?(aujourd'hui|demain|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|\d{1,2}(?:\/\d{1,2})?)(?=\s)/i,
    m => { out.deadline = dayWord(m[1], ref); });

  // horaires : "de 14h à 17h", "14h-17h30", puis "à 14h"
  take(/\s(?:de\s+)?(\d{1,2})\s*h\s*(\d{2})?\s*(?:à|a|-|–|jusqu'à)\s*(\d{1,2})\s*h?\s*(\d{2})?(?=\s)/i, m => {
    out.start = hm(+m[1], +(m[2] || 0));
    out.end = hm(+m[3], +(m[4] || 0));
  });
  take(/\sde\s+(\d{1,2})\s*h?\s*(\d{2})?\s*(?:à|a|-)\s*(\d{1,2})\s*h\s*(\d{2})?(?=\s)/i, m => {
    out.start = hm(+m[1], +(m[2] || 0));
    out.end = hm(+m[3], +(m[4] || 0));
  });
  take(/\s(?:à|a|vers)\s+(\d{1,2})\s*h\s*(\d{2})?(?=\s)/i, m => { out.start = hm(+m[1], +(m[2] || 0)); });

  // durée : "3h", "1h30", "45 min", "1,5h"
  take(/\s(\d+(?:[.,]\d+)?)\s*h\s*(\d{2})?(?=\s)/i, m => {
    out.duration = Math.round(parseFloat(m[1].replace(',', '.')) * 60) + Number(m[2] || 0);
  });
  take(/\s(\d+)\s*(?:min|mn|minutes?)(?=\s)/i, m => { out.duration = Number(m[1]); });

  // jour prévu
  take(/\s(aujourd'hui|demain|après-demain|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)(?:\s+prochain)?(?=\s)/i,
    m => { out.date = dayWord(m[1], ref); });
  take(/\sle\s+(\d{1,2})(?:\/(\d{1,2}))?(?=\s)/i, m => { out.date = dayWord(m[2] ? `${m[1]}/${m[2]}` : m[1], ref); });

  // matière : "#analyse"
  take(/\s#([\p{L}\d-]+)(?=\s)/iu, m => {
    const q = m[1].toLowerCase();
    const sub = subjects.find(x => x.short.toLowerCase().startsWith(q) || x.name.toLowerCase().includes(q));
    if (sub) out.subject = sub.id;
  });

  // cohérence des horaires
  if (out.start && !out.end && out.duration) out.end = fromMin(toMin(out.start) + out.duration);
  if (out.start && !out.end) out.end = fromMin(toMin(out.start) + 60);
  if (out.start && out.end) out.duration = toMin(out.end) - toMin(out.start);

  out.title = s.replace(/\s+/g, ' ').trim().replace(/^./, c => c.toUpperCase());
  out.date ??= ref;
  if (out.rule?.type === 'week' && !out.rule.days) out.rule.days = [parseKey(out.date).getDay()];
  return out;
}

const fromMin = m => hm(Math.floor(m / 60) % 24, m % 60);

function dayWord(w, ref) {
  w = w.toLowerCase();
  if (w === "aujourd'hui") return ref;
  if (w === 'demain') return addDays(ref, 1);
  if (w === 'après-demain') return addDays(ref, 2);
  const i = DAYS.indexOf(w);
  if (i >= 0) {
    const diff = (i - parseKey(ref).getDay() + 7) % 7;
    return addDays(ref, diff === 0 ? 7 : diff);
  }
  const [d, m] = w.split('/').map(Number);
  const r = parseKey(ref);
  let date = new Date(r.getFullYear(), m ? m - 1 : r.getMonth(), d);
  if (dateKey(date) < ref) date = m ? new Date(r.getFullYear() + 1, m - 1, d) : new Date(r.getFullYear(), r.getMonth() + 1, d);
  return dateKey(date);
}

/* ---------- Création ---------- */

export function addTask(fields) {
  const { rule, ...rest } = fields;
  update(d => {
    if (rule) {
      const series = {
        id: uid(), title: rest.title, start: rest.start || null, end: rest.end || null,
        duration: rest.duration || null, priority: rest.priority || 1, subject: rest.subject || null,
        rule, from: rest.date, until: null, skip: [],
      };
      d.series.push(series);
    } else {
      d.tasks.push(normalize({ ...rest, id: uid() }));
    }
  });
  if (rule) materialize(fields.date);
}

export function normalize(t) {
  return {
    id: t.id, title: t.title, date: t.date || dateKey(),
    start: t.start || null, end: t.end || null, duration: t.duration || null,
    priority: t.priority || 1, deadline: t.deadline || null, subject: t.subject || null,
    done: Boolean(t.done), doneAt: t.doneAt || null, postponed: t.postponed || 0,
    seriesId: t.seriesId || null, created: t.created || new Date().toISOString(),
  };
}

/* ---------- Tâches répétées ---------- */

function seriesOn(s, key) {
  if (key < s.from || (s.until && key > s.until) || s.skip.includes(key)) return false;
  const wd = parseKey(key).getDay();
  if (s.rule.type === 'day') return true;
  if (!s.rule.days.includes(wd)) return false;
  const weeks = Math.floor((parseKey(key) - parseKey(s.from)) / (7 * 864e5));
  return weeks % (s.rule.interval || 1) === 0;
}

// Crée (une seule fois) les tâches des séries prévues ce jour-là.
export function materialize(key) {
  const { series, tasks } = getData();
  const missing = series.filter(s => seriesOn(s, key) && !tasks.some(t => t.seriesId === s.id && t.date === key));
  if (!missing.length) return;
  update(d => {
    for (const s of missing) {
      d.tasks.push(normalize({
        id: uid(), seriesId: s.id, date: key, title: s.title, start: s.start, end: s.end,
        duration: s.duration, priority: s.priority, subject: s.subject,
      }));
    }
  });
}

export function ruleLabel(rule) {
  if (!rule) return '';
  if (rule.type === 'day') return 'Tous les jours';
  const names = rule.days.map(d => DAYS[d]).join(', ');
  return rule.interval > 1 ? `Toutes les ${rule.interval} semaines (${names})` : `Chaque ${names}`;
}

/* ---------- Tri ---------- */

// Ordre d'affichage : non faites d'abord, puis horaire, priorité, échéance.
export function sortTasks(list) {
  return [...list].sort((a, b) =>
    a.done - b.done ||
    (a.start || '99').localeCompare(b.start || '99') ||
    b.priority - a.priority ||
    (a.deadline || '9999').localeCompare(b.deadline || '9999') ||
    a.created.localeCompare(b.created));
}
