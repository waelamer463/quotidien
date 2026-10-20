import { getData, update, requestPersistence } from './storage.js';
import * as todayView from './today-view.js';
import * as statsView from './stats-view.js';
import * as settingsView from './settings-view.js';
import { applyTheme } from './theme.js';
import * as chronoView from './chrono-view.js';
import * as examsView from './exams-view.js';
import * as planningView from './planning-view.js';
import { icon } from './icons.js';
import { renderSky } from './sky.js';
import { dailyCheck } from './revision-plan.js';
import { watchFeedback } from './revision-feedback.js';

const views = {
  aujourdhui: {
    title: 'Aujourd\'hui',
    render: todayView.render,
  },
  stats: {
    title: 'Stats',
    render: statsView.render,
  },
  examens: {
    title: 'Examens',
    render: examsView.render,
  },
  chrono: {
    title: 'Chrono',
    render: chronoView.render,
  },
  reglages: {
    title: 'Réglages',
    render: settingsView.render,
  },
  planning: {
    title: 'Planning',
    render: planningView.render,
  },
};

// L'URL a la forme #onglet/sous-page/argument, ex. #habitudes/modifier/abc123
function route() {
  const [tab, ...params] = location.hash.slice(1).split('/');
  return views[tab] ? { tab, params } : { tab: getData().settings.lastTab, params: [] };
}

function render() {
  const { tab, params } = route();
  const el = document.getElementById('view');
  el.onclick = el.onkeydown = el.onchange = null;
  const title = views[tab].render(el, params);
  document.getElementById('view-title').textContent = title || views[tab].title;
  const tabs = [...document.querySelectorAll('.tabbar a')];
  tabs.forEach(a => a.classList.toggle('active', a.dataset.tab === tab));
  const i = tabs.findIndex(a => a.dataset.tab === tab);
  const bar = document.querySelector('.tabbar');
  bar.style.setProperty('--i', Math.max(0, i));
  bar.classList.toggle('no-pill', i < 0);
  window.scrollTo(0, 0);
  renderSky(document.querySelector('.topbar'));
  if (tab !== 'reglages' && tab !== 'chrono') update(d => { d.settings.lastTab = tab; });
  chronoView.renderBar();
}

function renderDate() {
  const txt = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  document.getElementById('today').textContent = txt.charAt(0).toUpperCase() + txt.slice(1);
}

applyTheme();
document.querySelectorAll('[data-icon]').forEach(s => { s.outerHTML = icon(s.dataset.icon); });

// Le ciel et la date se mettent à jour chaque minute (et au retour dans l'app).
function tick() {
  renderDate();
  renderSky(document.querySelector('.topbar'));
}
setInterval(tick, 60_000);
setInterval(chronoView.tick, 1000);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  tick();
  // nouveau jour : séances manquées replanifiées
  const before = getData().revision.lastPlan;
  dailyCheck();
  if (getData().revision.lastPlan !== before) render();
});

window.addEventListener('hashchange', render);
dailyCheck();
watchFeedback();
tick();
render();
requestPersistence();

// ?nosw : désactive le mode hors ligne (tests automatisés uniquement)
if ('serviceWorker' in navigator && !location.search.includes('nosw')) {
  // Quand une nouvelle version prend le relais, on recharge une fois pour l'afficher.
  const hadController = Boolean(navigator.serviceWorker.controller);
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController && !reloaded) {
      reloaded = true;
      location.reload();
    }
  });
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' });
}
