// Mode examens : évaluations, chapitres, maîtrise.
//
// Évaluation : { id, type, subject, title, date, time, coef, format, felt (1–5),
//   chapters: [{ id, name, mastery (0–5), fear, history: [{ date, mastery }] }],
//   grade, gradeMax, created }

import { getData, update } from './storage.js';
import { dateKey, parseKey, uid } from './util.js';

export function daysUntil(date, from = dateKey()) {
  return Math.round((parseKey(date) - parseKey(from)) / 864e5);
}

export function countdownLabel(date) {
  const n = daysUntil(date);
  return n === 0 ? 'Jour J' : n > 0 ? `J-${n}` : `J+${-n}`;
}

export function upcoming(from = dateKey()) {
  return getData().exams.filter(e => e.date >= from).sort((a, b) => a.date.localeCompare(b.date));
}

export function past(from = dateKey()) {
  return getData().exams.filter(e => e.date < from).sort((a, b) => b.date.localeCompare(a.date));
}

// Maîtrise moyenne (0 à 1), pondérée : les chapitres qui font peur comptent double.
export function readiness(exam) {
  if (!exam.chapters.length) return 0;
  let sum = 0, w = 0;
  for (const c of exam.chapters) { const k = c.fear ? 2 : 1; sum += (c.mastery / 5) * k; w += k; }
  return sum / w;
}

export function saveExam(exam) {
  update(d => {
    const i = d.exams.findIndex(x => x.id === exam.id);
    if (i >= 0) d.exams[i] = exam; else d.exams.push(exam);
  });
}

export function newExam(fields) {
  return {
    id: uid(), type: 'partiel', subject: null, title: '', date: dateKey(), time: '', coef: 1, format: 'exos', felt: 3,
    chapters: [], grade: null, gradeMax: 20, created: new Date().toISOString(), ...fields,
  };
}

export function setMastery(examId, chapterId, mastery) {
  update(d => {
    const c = d.exams.find(x => x.id === examId)?.chapters.find(x => x.id === chapterId);
    if (!c) return;
    c.mastery = mastery;
    c.history = [...(c.history || []), { date: dateKey(), mastery }];
  });
}

export function examName(e) {
  const subj = getData().planning.subjects.find(s => s.id === e.subject);
  return e.title || subj?.short || 'Évaluation';
}
