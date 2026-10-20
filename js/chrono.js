// Chrono de concentration et sessions de travail.
//
// data.chrono   = { startedAt, accumulated, paused, subject, taskId, label, planned } | null
//                 (calculé à partir des horodatages : il continue même app fermée)
// data.sessions = [{ id, date, start, end, minutes, subject, taskId, label, planned, feedback }]

import { getData, update } from './storage.js';
import { dateKey, addDays, parseKey, uid } from './util.js';

const now = () => Date.now();
const hhmm = t => { const d = new Date(t); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

export function running() {
  return getData().chrono;
}

export function elapsedMs(c = running()) {
  if (!c) return 0;
  return c.accumulated + (c.paused ? 0 : now() - c.startedAt);
}

export function start({ subject = null, taskId = null, label = '', planned = null } = {}) {
  update(d => {
    d.chrono = { startedAt: now(), firstStart: now(), accumulated: 0, paused: false, subject, taskId, label, planned };
  });
}

export function pause() {
  update(d => {
    const c = d.chrono;
    if (!c || c.paused) return;
    c.accumulated += now() - c.startedAt;
    c.paused = true;
  });
}

export function resume() {
  update(d => {
    const c = d.chrono;
    if (!c || !c.paused) return;
    c.startedAt = now();
    c.paused = false;
  });
}

// Arrête et enregistre la session. Renvoie la session (ou null si moins d'une minute).
export function stop() {
  const c = running();
  if (!c) return null;
  const minutes = Math.round(elapsedMs(c) / 60000);
  let session = null;
  update(d => {
    d.chrono = null;
    if (minutes < 1) return;
    session = {
      id: uid(), date: dateKey(new Date(c.firstStart)), start: hhmm(c.firstStart), end: hhmm(now()),
      minutes, subject: c.subject, taskId: c.taskId, label: c.label, planned: c.planned, feedback: null,
    };
    d.sessions.push(session);
  });
  return session;
}

export function cancel() {
  update(d => { d.chrono = null; });
}

export function addManual({ date, start, end, subject, label }) {
  const [a, b] = [start, end].map(s => { const [h, m] = s.split(':').map(Number); return h * 60 + m; });
  update(d => {
    d.sessions.push({ id: uid(), date, start, end, minutes: b - a, subject: subject || null, taskId: null, label: label || '', planned: null, feedback: null, manual: true });
  });
}

export function removeSession(id) {
  update(d => { d.sessions = d.sessions.filter(s => s.id !== id); });
}

/* ---------- Totaux ---------- */

export function minutesOn(date) {
  const done = getData().sessions.filter(s => s.date === date).reduce((n, s) => n + s.minutes, 0);
  const c = running();
  const live = c && dateKey(new Date(c.firstStart)) === date ? Math.floor(elapsedMs(c) / 60000) : 0;
  return done + live;
}

// Minutes par matière entre deux dates incluses (session en cours comprise).
export function minutesBySubject(from, to) {
  const out = {};
  for (const s of getData().sessions) {
    if (s.date < from || s.date > to) continue;
    const k = s.subject || 'autre';
    out[k] = (out[k] || 0) + s.minutes;
  }
  const c = running();
  if (c) {
    const d = dateKey(new Date(c.firstStart));
    if (d >= from && d <= to) { const k = c.subject || 'autre'; out[k] = (out[k] || 0) + Math.floor(elapsedMs(c) / 60000); }
  }
  return out;
}

export function weekRange(key = dateKey()) {
  const monday = addDays(key, -((parseKey(key).getDay() + 6) % 7));
  return [monday, addDays(monday, 6)];
}

export const fmtClock = ms => {
  const s = Math.floor(ms / 1000);
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map(n => String(n).padStart(2, '0')).join(':');
};
export const fmtMin = m => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? String(m % 60).padStart(2, '0') : ''}` : `${m} min`);
