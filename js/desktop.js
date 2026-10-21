// Pont avec l'app Mac (Tauri). Sans effet dans un navigateur.
//   - chrono en cours affiché à côté de l'icône de la barre des menus
//   - notifications système pour les rappels (prière, début de bloc)
//   - lancement au démarrage de l'ordinateur

import { getData, update } from './storage.js';
import { running, elapsedMs } from './chrono.js';

const T = window.__TAURI__;
export const inApp = Boolean(T);
const invoke = (cmd, args) => T.core.invoke(cmd, args);

export const desktopPrefs = () => ({ notifications: true, widget: true, widgetPinned: true, ...getData().settings.desktop });
export const showWidget = visible => (inApp ? invoke('set_widget', { visible }).catch(() => {}) : null);
export const setDesktopPrefs = patch => update(d => { d.settings.desktop = { ...desktopPrefs(), ...patch }; });

export const autostartEnabled = () => (inApp ? invoke('plugin:autostart|is_enabled') : Promise.resolve(false));
export const setAutostart = on => invoke(on ? 'plugin:autostart|enable' : 'plugin:autostart|disable');

export async function notify(title, body = '') {
  if (!inApp || !desktopPrefs().notifications) return;
  try {
    let ok = await invoke('plugin:notification|is_permission_granted');
    if (!ok) ok = (await invoke('plugin:notification|request_permission')) === 'granted';
    if (ok) await invoke('plugin:notification|notify', { options: { title, body } });
  } catch (e) { console.warn('Notification impossible', e); }
}

let lastTitle = null;
function trayTick() {
  const c = running();
  let title = '';
  if (c) {
    const s = Math.floor(elapsedMs(c) / 1000);
    title = `${c.paused ? '❚❚ ' : ''}${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`;
  }
  if (title !== lastTitle) { lastTitle = title; invoke('set_tray_title', { title }).catch(() => {}); }
}

export function startDesktop() {
  if (!inApp) return;
  // bande invisible en haut pour déplacer la fenêtre (la barre de titre est fondue dans l'app)
  const drag = document.createElement('div');
  drag.className = 'drag-strip';
  drag.setAttribute('data-tauri-drag-region', '');
  document.body.prepend(drag);
  trayTick();
  setInterval(trayTick, 1000);
  if (desktopPrefs().widget) showWidget(true);
}
