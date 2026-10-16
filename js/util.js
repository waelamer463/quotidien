export const pad = n => String(n).padStart(2, '0');

// Clé de date locale "AAAA-MM-JJ" (toISOString décalerait le jour à cause du fuseau).
export function dateKey(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key, n) {
  const d = parseKey(key);
  d.setDate(d.getDate() + n);
  return dateKey(d);
}

export function dayLabel(key) {
  const today = dateKey();
  if (key === today) return "Aujourd'hui";
  if (key === addDays(today, -1)) return 'Hier';
  const txt = parseKey(key).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  return txt.charAt(0).toUpperCase() + txt.slice(1);
}

export function fmt(n) {
  return Number(n).toLocaleString('fr-FR', { maximumFractionDigits: 2 });
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
