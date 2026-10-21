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

function keep(json, email) {
  saveSession({
    email: email || json.user?.email, user: json.user?.id, access: json.access_token, refresh: json.refresh_token,
    expires: Date.now() + (json.expires_in || 3600) * 1000 - 60000,
  });
}

// Jeton valide (rafraîchi si besoin), ou null si déconnecté.
async function token() {
  const s = session();
  if (!s) return null;
  if (Date.now() < s.expires) return s.access;
  const json = await api('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: s.refresh } });
  keep(json, s.email);
  return json.access_token;
}

export async function sendCode(email) {
  await api(`/auth/v1/otp?redirect_to=${encodeURIComponent(LOGIN_PAGE)}`, { method: 'POST', body: { email, create_user: true } });
}

// Code collé : soit le code à chiffres de l'e-mail, soit le code de connexion de la page du lien.
export async function useCode(email, code) {
  const c = code.trim();
  if (/^\d{6,10}$/.test(c)) return verifyCode(email, c);
  const json = await api('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: c } });
  keep(json, json.user?.email || email);
}

export async function verifyCode(email, code) {
  const json = await api('/auth/v1/verify', { method: 'POST', body: { type: 'email', email, token: code.trim() } });
  keep(json, email);
}

export function signOut() {
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
    body: { user_id: s.user, data: getData(), updated_at: now },
  });
  setMeta({ syncedAt: now });
}

// Parties de `remote` plus récentes que les nôtres, et s'il nous reste des parties plus récentes.
export function diff(local, remote) {
  const lt = local.meta?.keyTimes || {}, rt = remote.meta?.keyTimes || {};
  const take = {};
  let localNewer = false;
  for (const k of new Set([...Object.keys(local), ...Object.keys(remote)])) {
    if (k === 'meta' || k === 'version') continue;
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
    const tok = await token();
    const row = await fetchRemote(tok);
    if (!row) await pushNow(tok);
    else if (!getData().meta?.syncedAt) await firstLink(row, tok);
    else {
      const { take, times, localNewer } = diff(getData(), row.data);
      applyRemote(take, times, row.updated_at);
      if (localNewer) await pushNow(tok);
    }
    setStatus({ state: 'ok', at: Date.now(), error: '' });
  } catch (e) {
    if (e.status === 401 || e.status === 400 && /refresh/i.test(e.message)) { saveSession(null); setStatus({ state: 'off', error: 'Session expirée : reconnecte-toi.' }); }
    else setStatus({ state: navigator.onLine ? 'error' : 'offline', error: e.message });
  } finally {
    busy = false;
  }
}

// Premier branchement d'un appareil sur un compte qui a déjà des données.
const hasData = d => Boolean(d.tasks?.length || Object.keys(d.log || {}).length || d.sessions?.length || d.exams?.length);
async function firstLink(row, tok) {
  if (!hasData(getData())) return adoptRow(row);
  const useAccount = await ask({
    title: 'Ton compte a déjà des données',
    text: 'Utiliser celles du compte (cet appareil sera remplacé), ou garder celles de cet appareil (le compte sera remplacé) ?',
    ok: 'Utiliser le compte', cancel: 'Garder cet appareil', dismiss: false,
  });
  return useAccount ? adoptRow(row) : pushNow(tok);
}

function adoptRow(row) {
  const rt = row.data.meta?.keyTimes || {};
  const parts = {}, times = {};
  for (const [k, v] of Object.entries(row.data)) {
    if (k === 'meta' || k === 'version') continue;
    parts[k] = v;
    times[k] = rt[k] || 1;
  }
  applyRemote(parts, times, row.updated_at);
}

// Le compte a-t-il déjà des données ?
export async function remoteExists() {
  const row = await fetchRemote(await token());
  return row ? row.data : null;
}

// Remplace tout l'appareil par les données du compte.
export async function adoptRemote() {
  const row = await fetchRemote(await token());
  if (!row) return false;
  adoptRow(row);
  setStatus({ state: 'ok', at: Date.now(), error: '' });
  return true;
}

// Envoie tout l'appareil sur le compte (écrase).
export async function pushAll() {
  await pushNow(await token());
  setStatus({ state: 'ok', at: Date.now(), error: '' });
}

/* ---------- Démarrage ---------- */

export function startSync() {
  if (!configured()) return;
  onChange(({ remote } = {}) => {
    if (remote || !session()) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(syncNow, PUSH_DELAY);
  });
  window.addEventListener('online', syncNow);
  window.addEventListener('offline', () => setStatus({ state: 'offline' }));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) syncNow(); });
  setInterval(() => { if (!document.hidden) syncNow(); }, PULL_EVERY);
  if (session()) syncNow();
}
