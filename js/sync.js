// Synchronisation entre appareils (Supabase), sans bibliothèque : appels HTTP directs.
//
// Connexion : un code à 6 chiffres reçu par e-mail (pas de lien : sur iPhone, un lien
// s'ouvrirait dans Safari et non dans l'app installée).
// Données : une ligne par compte dans la table quotidien_state { user_id, data, updated_at }.
// Fusion : chaque partie (tâches, essentiels, planning…) garde la date de sa dernière
// modification ; à la synchro, la version la plus récente de chaque partie gagne.
// Hors ligne : l'app marche normalement, l'envoi est retenté au retour du réseau.

import { getData, onChange, applyRemote, setMeta } from './storage.js';
import { SUPABASE_URL, SUPABASE_KEY } from './sync-config.js';
import { ask } from './dialog.js';
import { widgetSummary } from './widget-summary.js';
import { dateKey } from './util.js';

const AUTH_KEY = 'quotidien:auth';
// Page ouverte par le lien de l'e-mail : elle affiche un code de connexion à coller dans l'app.
export const LOGIN_PAGE = 'https://waelamer463.github.io/quotidien/connexion.html';
const TABLE = 'quotidien_state';
const PUSH_DELAY = 3000;
const PULL_EVERY = 60000;

let status = { state: 'off', at: null, error: '' }; // off | ok | syncing | offline | error
let pushTimer = null;
let busy = false;
const watchers = [];

export const configured = () => Boolean(SUPABASE_URL && SUPABASE_KEY);
export const getStatus = () => status;
export const onStatus = fn => watchers.push(fn);
const setStatus = patch => { status = { ...status, ...patch }; watchers.forEach(f => f(status)); };

/* ---------- Session ---------- */

function session() {
  try { return JSON.parse(localStorage.getItem(AUTH_KEY)); } catch { return null; }
}
function saveSession(s) {
  if (s) localStorage.setItem(AUTH_KEY, JSON.stringify(s)); else localStorage.removeItem(AUTH_KEY);
}
export const account = () => session()?.email || null;

async function api(path, { method = 'GET', body, token, headers = {} } = {}) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = new Error(json?.msg || json?.message || json?.error_description || `Erreur ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return json;
}

function keep(json, email, fresh = false) {
  if (fresh) { setMeta({ syncedAt: null }); localStorage.removeItem('quotidien:sync-lost'); } // nouvelle connexion : premier branchement
  saveSession({
    email: email || json.user?.email, user: json.user?.id, access: json.access_token, refresh: json.refresh_token,
    expires: Date.now() + (json.expires_in || 3600) * 1000 - 60000,
  });
}

// Jeton valide (rafraîchi si besoin), ou null si déconnecté.
// Le renouvellement ne se fait que quand l'app est à l'écran : sur iPhone, une app mise en
// pause au milieu du renouvellement perdrait la nouvelle clé et serait déconnectée.
let refreshing = null;
async function token(force = false) {
  const s = session();
  if (!s) return null;
  if (!force && Date.now() < s.expires) return s.access;
  if (document.hidden) { const e = new Error('en attente'); e.deferred = true; throw e; }
  refreshing ??= api('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: s.refresh } })
    .then(json => { keep(json, s.email); return json.access_token; })
    .finally(() => { refreshing = null; });
  return refreshing;
}

// Appel avec jeton ; si le serveur refuse le jeton (expiré plus tôt que prévu), on le renouvelle une fois.
async function authed(fn) {
  try { return await fn(await token()); }
  catch (e) {
    if (e.status !== 401) throw e;
    return fn(await token(true));
  }
}

export async function sendCode(email) {
  await api(`/auth/v1/otp?redirect_to=${encodeURIComponent(LOGIN_PAGE)}`, { method: 'POST', body: { email, create_user: true } });
}

// Code collé : soit le code à chiffres de l'e-mail, soit le code de connexion de la page du lien.
export async function useCode(email, code) {
  const c = code.trim();
  if (/^\d{6,10}$/.test(c)) return verifyCode(email, c);
  const json = await api('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: c } });
  keep(json, json.user?.email || email, true);
}

export async function verifyCode(email, code) {
  const json = await api('/auth/v1/verify', { method: 'POST', body: { type: 'email', email, token: code.trim() } });
  keep(json, email, true);
}

export const syncLost = () => !session() && localStorage.getItem('quotidien:sync-lost') === '1';

export function signOut() {
  localStorage.removeItem('quotidien:sync-lost');
  saveSession(null);
  setMeta({ syncedAt: null });
  setStatus({ state: 'off', at: null, error: '' });
}

/* ---------- Données ---------- */

async function fetchRemote(tok) {
  const rows = await api(`/rest/v1/${TABLE}?select=data,updated_at`, { token: tok });
  return rows[0] || null;
}

async function pushNow(tok) {
  const s = session();
  const now = new Date().toISOString();
  await api(`/rest/v1/${TABLE}?on_conflict=user_id`, {
    method: 'POST', token: tok, headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: { user_id: s.user, data: { ...getData(), widget: safeSummary() }, updated_at: now },
  });
  setMeta({ syncedAt: now });
}

// Résumé pour le widget iPhone (jamais bloquant pour la synchro).
function safeSummary() {
  try { return widgetSummary(); } catch (e) { console.warn('Résumé du widget impossible', e); return null; }
}

// Parties de `remote` plus récentes que les nôtres, et s'il nous reste des parties plus récentes.
export function diff(local, remote) {
  const lt = local.meta?.keyTimes || {}, rt = remote.meta?.keyTimes || {};
  const take = {};
  let localNewer = false;
  for (const k of new Set([...Object.keys(local), ...Object.keys(remote)])) {
    if (k === 'meta' || k === 'version' || k === 'widget') continue;
    if ((rt[k] || 0) > (lt[k] || 0) && k in remote) take[k] = remote[k];
    else if ((lt[k] || 0) > (rt[k] || 0)) localNewer = true;
  }
  return { take, times: rt, localNewer };
}

// Synchro complète : récupère, fusionne, renvoie si besoin.
export async function syncNow() {
  if (!configured() || !session() || busy) return;
  if (!navigator.onLine) { setStatus({ state: 'offline' }); return; }
  busy = true;
  setStatus({ state: 'syncing' });
  try {
    const row = await authed(fetchRemote);
    if (!row) await authed(pushNow);
    else if (!getData().meta?.syncedAt) await firstLink(row);
    else {
      const { take, times, localNewer } = diff(getData(), row.data);
      applyRemote(take, times, row.updated_at);
      // on renvoie aussi si le résumé du widget date d'hier ou a plus de 15 min
      const w = row.data.widget;
      const stale = !w || w.date !== dateKey() || Date.now() - Date.parse(w.at) > 15 * 60000;
      if (localNewer || stale) await authed(pushNow);
    }
    setStatus({ state: 'ok', at: Date.now(), error: '' });
  } catch (e) {
    if (e.deferred) setStatus({ state: 'ok' }); // reprendra au retour dans l'app
    // déconnexion seulement si le serveur refuse vraiment la clé de renouvellement
    else if (e.status === 400 && /refresh|invalid|revoked|already used/i.test(e.message)) {
      saveSession(null);
      setMeta({ syncedAt: null });
      localStorage.setItem('quotidien:sync-lost', '1');
      setStatus({ state: 'off', error: 'Session terminée : reconnecte cet appareil avec un nouveau lien.' });
    }
    else setStatus({ state: navigator.onLine ? 'error' : 'offline', error: e.message });
  } finally {
    busy = false;
  }
}

// Premier branchement d'un appareil sur un compte qui a déjà des données.
const hasData = d => Boolean(d.tasks?.length || Object.keys(d.log || {}).length || d.sessions?.length || d.exams?.length);
async function firstLink(row) {
  if (!hasData(getData())) return adoptRow(row);
  const useAccount = await ask({
    title: 'Ton compte a déjà des données',
    text: 'Utiliser celles du compte (cet appareil sera remplacé), ou garder celles de cet appareil (le compte sera remplacé) ?',
    ok: 'Utiliser le compte', cancel: 'Garder cet appareil', dismiss: false,
  });
  return useAccount ? adoptRow(row) : authed(pushNow);
}

function adoptRow(row) {
  const rt = row.data.meta?.keyTimes || {};
  const parts = {}, times = {};
  for (const [k, v] of Object.entries(row.data)) {
    if (k === 'meta' || k === 'version' || k === 'widget') continue;
    parts[k] = v;
    times[k] = rt[k] || 1;
  }
  applyRemote(parts, times, row.updated_at);
}

// Le compte a-t-il déjà des données ?
export async function remoteExists() {
  const row = await authed(fetchRemote);
  return row ? row.data : null;
}

// Remplace tout l'appareil par les données du compte.
export async function adoptRemote() {
  const row = await authed(fetchRemote);
  if (!row) return false;
  adoptRow(row);
  setStatus({ state: 'ok', at: Date.now(), error: '' });
  return true;
}

// Envoie tout l'appareil sur le compte (écrase).
export async function pushAll() {
  await authed(pushNow);
  setStatus({ state: 'ok', at: Date.now(), error: '' });
}

/* ---------- Démarrage ---------- */

export function startSync() {
  if (!configured()) return;
  onChange(({ remote, fromWindow } = {}) => {
    if ((remote && !fromWindow) || !session()) return; // un changement fait dans le widget doit aussi partir
    clearTimeout(pushTimer);
    pushTimer = setTimeout(syncNow, PUSH_DELAY);
  });
  window.addEventListener('online', syncNow);
  window.addEventListener('offline', () => setStatus({ state: 'offline' }));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) syncNow(); });
  setInterval(() => { if (!document.hidden) syncNow(); }, PULL_EVERY);
  if (session()) syncNow();
}
