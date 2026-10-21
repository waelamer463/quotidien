// Widget Quotidien pour iPhone (app Scriptable).
// Il lit sur ton compte le résumé de la journée envoyé par l'app Quotidien (iPhone ou Mac).
// Première fois : lance ce script dans Scriptable pour te connecter (lien reçu par e-mail).

const URL = 'https://dasksxjuhwlowvqrcrqe.supabase.co';
const KEY = 'sb_publishable_Osv2TKeXjik89-XIID9QCg_OvjNU6yX';
const LOGIN_PAGE = 'https://waelamer463.github.io/quotidien/connexion.html';
const APP = 'https://waelamer463.github.io/quotidien/';
const KC = 'quotidien.session';
const C = { bg1: '#0E1A33', bg2: '#070B16', text: '#E9F1FF', muted: '#8394B3', accent: '#4FE3F0', warm: '#F5B95A', hot: '#FF7A8A', violet: '#9D8CFF' };

/* ---------- Connexion ---------- */

async function api(path, { method = 'GET', body, token } = {}) {
  const r = new Request(URL + path);
  r.method = method;
  r.headers = { apikey: KEY, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  if (body) r.body = JSON.stringify(body);
  const json = await r.loadJSON().catch(() => null);
  if (r.response.statusCode >= 400) throw new Error((json && (json.msg || json.message || json.error_description)) || `Erreur ${r.response.statusCode}`);
  return json;
}
const session = () => (Keychain.contains(KC) ? JSON.parse(Keychain.get(KC)) : null);
function keep(j) { Keychain.set(KC, JSON.stringify({ access: j.access_token, refresh: j.refresh_token, expires: Date.now() + (j.expires_in || 3600) * 1000 - 60000 })); }

async function token() {
  const s = session();
  if (!s) return null;
  if (Date.now() < s.expires) return s.access;
  keep(await api('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: s.refresh } }));
  return session().access;
}

async function login() {
  const a = new Alert();
  a.title = 'Connexion à Quotidien';
  a.message = 'Ton adresse e-mail (la même que dans l\'app). Tu vas recevoir un lien.';
  a.addTextField('ton@email.fr');
  a.addAction('Recevoir le lien');
  a.addCancelAction('Annuler');
  if (await a.presentAlert() === -1) return false;
  const email = a.textFieldValue(0).trim();
  await api(`/auth/v1/otp?redirect_to=${encodeURIComponent(LOGIN_PAGE)}`, { method: 'POST', body: { email, create_user: false } });
  const b = new Alert();
  b.title = 'Colle ton code';
  b.message = 'Ouvre l\'e-mail, touche le lien, puis « Copier le code ». Reviens ici et colle-le.';
  b.addTextField('Code de connexion');
  b.addAction('Valider');
  b.addCancelAction('Annuler');
  if (await b.presentAlert() === -1) return false;
  keep(await api('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: b.textFieldValue(0).trim() } }));
  return true;
}

async function summary() {
  const rows = await api('/rest/v1/quotidien_state?select=widget:data->widget', { token: await token() });
  return rows && rows[0] ? rows[0].widget : null;
}

/* ---------- Mascotte (dessinée) ---------- */

function mascot(face, size) {
  const ctx = new DrawContext();
  ctx.size = new Size(120, 120);
  ctx.opaque = false;
  ctx.respectScreenScale = true;
  const mood = { star: '#FFD75E', rappel: C.warm, stress: C.hot, sad: '#8FD8FF', night: C.violet }[face] || C.accent;
  ctx.setFillColor(new Color(mood, 0.18)); ctx.fillEllipse(new Rect(14, 14, 92, 92));
  ctx.setFillColor(new Color('#16295A')); ctx.fillEllipse(new Rect(20, 20, 80, 80));
  ctx.setStrokeColor(new Color(mood, 0.8)); ctx.setLineWidth(2); ctx.strokeEllipse(new Rect(20, 20, 80, 80));
  ctx.setFillColor(new Color('#FFFFFF', 0.14)); ctx.fillEllipse(new Rect(30, 28, 36, 22));
  const line = (pts) => { const p = new Path(); p.move(new Point(...pts[0])); pts.slice(1).forEach(q => p.addLine(new Point(...q))); ctx.addPath(p); ctx.strokePath(); };
  ctx.setStrokeColor(new Color('#EEF4FF')); ctx.setLineWidth(5);
  const smile = (y, d) => { const p = new Path(); p.move(new Point(52, y)); p.addQuadCurve(new Point(68, y), new Point(60, y + d)); ctx.addPath(p); ctx.strokePath(); };
  if (face === 'joy') { line([[43, 58], [48, 52], [53, 58]]); line([[67, 58], [72, 52], [77, 58]]); smile(70, 8); }
  else if (face === 'star') {
    ctx.setFillColor(new Color('#FFD75E'));
    for (const cx of [48, 72]) { const p = new Path(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 3.6 : 8; const pt = new Point(cx + r * Math.cos(a), 55 + r * Math.sin(a)); i ? p.addLine(pt) : p.move(pt); } p.closeSubpath(); ctx.addPath(p); ctx.fillPath(); }
    smile(69, 10);
  } else if (face === 'stress') { line([[43, 50], [52, 55], [43, 60]]); line([[77, 50], [68, 55], [77, 60]]); line([[53, 76], [67, 76]]); }
  else if (face === 'sad') { line([[43, 51], [53, 51]]); line([[48, 51], [48, 60]]); line([[67, 51], [77, 51]]); line([[72, 51], [72, 60]]); const p = new Path(); p.move(new Point(54, 77)); p.addQuadCurve(new Point(66, 77), new Point(60, 71)); ctx.addPath(p); ctx.strokePath(); }
  else if (face === 'night') { line([[43, 56], [53, 56]]); line([[67, 56], [77, 56]]); line([[54, 75], [66, 75]]); }
  else if (face === 'rappel') { line([[48, 49], [48, 60]]); line([[72, 49], [72, 60]]); ctx.setLineWidth(4); ctx.strokeEllipse(new Rect(55.5, 69.5, 9, 9)); }
  else { line([[48, 50], [48, 60]]); line([[72, 50], [72, 60]]); line([[55, 73], [65, 73]]); }
  return ctx.getImage();
}

/* ---------- Calculs ---------- */

const pad = n => String(n).padStart(2, '0');
const hm = m => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;
const key = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const inMin = m => (m < 60 ? `dans ${m} min` : `dans ${Math.floor(m / 60)} h ${pad(m % 60)}`);

function compute(s) {
  const now = new Date(), m = now.getHours() * 60 + now.getMinutes();
  const today = key(now), tomorrow = key(new Date(now.getTime() + 864e5));
  const day = s.days[today];
  if (!day) return { stale: true };
  const block = day.blocks.find(b => b.s <= m && m < b.e);
  const next = day.blocks.find(b => b.s > m);
  let prayer = day.prayers.find(p => p.t > m);
  let prayerTxt = prayer ? `${prayer.n} ${hm(prayer.t)}` : null;
  if (!prayer && s.days[tomorrow]) { prayer = s.days[tomorrow].prayers[0]; prayerTxt = `${prayer.n} demain ${hm(prayer.t)}`; }
  const soon = prayer && prayer.t > m && prayer.t - m <= 10;
  const night = m >= s.bed || m < day.wake;
  const face = night ? 'night' : soon ? 'rappel' : ['night', 'rappel'].includes(s.face) ? 'neutral' : s.face;
  const task = (s.tasks || []).find(t => t.s === null || t.s + 30 > m);
  return { m, block, next, prayer, prayerTxt, prayerIn: prayer && prayer.t > m ? prayer.t - m : null, face, task };
}

/* ---------- Widget ---------- */

function base() {
  const w = new ListWidget();
  const g = new LinearGradient();
  g.colors = [new Color(C.bg1), new Color(C.bg2)];
  g.locations = [0, 1];
  w.backgroundGradient = g;
  w.url = APP;
  w.refreshAfterDate = new Date(Date.now() + 15 * 60000);
  return w;
}
function txt(stack, t, size, color = C.text, weight = 'semibold') {
  const x = stack.addText(t);
  x.font = weight === 'mono' ? Font.semiboldMonospacedSystemFont(size) : weight === 'regular' ? Font.systemFont(size) : Font.semiboldSystemFont(size);
  x.textColor = new Color(color);
  x.lineLimit = 1;
  x.minimumScaleFactor = 0.7;
  return x;
}
function chrono(stack, c, size) {
  const start = new Date(c.startedAt - c.accumulated);
  if (c.paused) { const s = Math.floor(c.accumulated / 1000); return txt(stack, `${Math.floor(s / 3600)}:${pad(Math.floor(s % 3600 / 60))} ❚❚`, size, C.accent, 'mono'); }
  const d = stack.addDate(start);
  d.applyTimerStyle();
  d.font = Font.semiboldMonospacedSystemFont(size);
  d.textColor = new Color(C.accent);
  d.lineLimit = 1;
  return d;
}

function message(title, sub) {
  const w = base();
  const top = w.addStack(); top.centerAlignContent();
  top.addImage(mascot('neutral')).imageSize = new Size(40, 40);
  w.addSpacer(8);
  txt(w, title, 14);
  if (sub) txt(w, sub, 12, C.muted, 'regular').lineLimit = 3;
  return w;
}

function small(s, x) {
  const w = base();
  w.setPadding(12, 14, 12, 14);
  const top = w.addStack(); top.centerAlignContent();
  top.addImage(mascot(x.face)).imageSize = new Size(42, 42);
  top.addSpacer();
  if (s.exam && s.exam.d <= 14) txt(top, `J-${s.exam.d}`, 13, C.accent, 'mono');
  w.addSpacer();
  if (s.chrono) { txt(w, s.chrono.label, 12, C.muted, 'regular'); chrono(w, s.chrono, 22); }
  else if (x.prayer) { txt(w, x.prayerTxt, 16); if (x.prayerIn !== null) txt(w, inMin(x.prayerIn), 12, C.accent, 'regular'); }
  w.addSpacer(4);
  txt(w, x.block ? `${x.block.l} → ${hm(x.block.e)}` : x.next ? `${x.next.l} à ${hm(x.next.s)}` : 'Fin de journée', 11, C.muted, 'regular');
  return w;
}

function medium(s, x) {
  const w = base();
  w.setPadding(12, 14, 12, 16);
  const row = w.addStack(); row.centerAlignContent();
  const left = row.addStack(); left.layoutVertically(); left.centerAlignContent();
  left.addImage(mascot(x.face)).imageSize = new Size(62, 62);
  if (s.exam && s.exam.d <= 30) { left.addSpacer(2); txt(left, `J-${s.exam.d} · ${s.exam.r}%`, 10, C.accent, 'mono'); }
  row.addSpacer(12);
  const right = row.addStack(); right.layoutVertically();
  const line = (label, value, color) => {
    const l = right.addStack(); l.centerAlignContent();
    txt(l, label, 11, C.muted, 'regular').lineLimit = 1;
    l.addSpacer(8);
    if (typeof value === 'function') value(l); else txt(l, value, 13, color);
    right.addSpacer(5);
  };
  line('Maintenant', x.block ? `${x.block.l} → ${hm(x.block.e)}` : x.next ? `Libre · ${x.next.l} ${hm(x.next.s)}` : 'Fin de journée');
  line('Tâche', x.task ? `${x.task.t}${x.task.s !== null && x.task.s > x.m ? ` · ${hm(x.task.s)}` : ''}` : 'Rien en attente');
  line('Prière', x.prayer ? `${x.prayerTxt}${x.prayerIn !== null && x.prayerIn <= 90 ? ` · ${inMin(x.prayerIn)}` : ''}` : '—', x.prayerIn !== null && x.prayerIn <= 10 ? C.warm : C.text);
  if (s.chrono) line(s.chrono.label, l => chrono(l, s.chrono, 14));
  return w;
}

async function build(family = config.widgetFamily) {
  if (!session()) return message('Connecte le widget', 'Ouvre Scriptable et lance le script « Quotidien » une fois.');
  let s;
  try { s = await summary(); } catch (e) { return message('Pas de connexion', 'Le widget réessaiera tout seul.'); }
  if (!s) return message('Rien à afficher', 'Ouvre l\'app Quotidien une fois pour envoyer ta journée.');
  const x = compute(s);
  if (x.stale) return message('Journée pas à jour', 'Ouvre l\'app Quotidien (iPhone ou Mac) pour la mettre à jour.');
  return family === 'small' ? small(s, x) : medium(s, x);
}

/* ---------- Lancement ---------- */

if (config.runsInWidget) {
  Script.setWidget(await build());
} else {
  if (!session()) {
    try { if (await login()) { const ok = new Alert(); ok.title = 'Widget connecté ✓'; ok.message = 'Ajoute le widget Scriptable sur ton écran d\'accueil et choisis le script « Quotidien ».'; ok.addAction('OK'); await ok.presentAlert(); } }
    catch (e) { const er = new Alert(); er.title = 'Connexion impossible'; er.message = String(e.message || e); er.addAction('OK'); await er.presentAlert(); }
  } else {
    const a = new Alert();
    a.title = 'Widget Quotidien';
    a.addAction('Aperçu (moyen)');
    a.addAction('Aperçu (petit)');
    a.addDestructiveAction('Se déconnecter');
    a.addCancelAction('Fermer');
    const i = await a.presentSheet();
    if (i === 0) (await build('medium')).presentMedium();
    if (i === 1) (await build('small')).presentSmall();
    if (i === 2) Keychain.remove(KC);
  }
}
Script.complete();
