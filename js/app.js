import { getData, update, requestPersistence } from './storage.js';
import * as todayView from './today-view.js';
import * as planningView from './planning-view.js';
import { icon } from './icons.js';
import { renderSky } from './sky.js';

const views = {
  aujourdhui: {
    title: 'Aujourd\'hui',
    render: todayView.render,
  },
  stats: {
    title: 'Stats',
    render: el => {
      el.innerHTML = `<div class="card"><h2>Nouvelles stats en préparation</h2>
        <p class="muted">Score du jour, essentiels, to-do et répartition de ta journée arrivent à l'étape R5.</p></div>`;
    },
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
  document.querySelector('.tabbar').style.setProperty('--i', tabs.findIndex(a => a.dataset.tab === tab));
  window.scrollTo(0, 0);
  renderSky(document.querySelector('.topbar'));
  update(d => { d.settings.lastTab = tab; });
}

function renderDate() {
  const txt = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  document.getElementById('today').textContent = txt.charAt(0).toUpperCase() + txt.slice(1);
}

document.querySelectorAll('[data-icon]').forEach(s => { s.outerHTML = icon(s.dataset.icon); });

// Le ciel et la date se mettent à jour chaque minute (et au retour dans l'app).
function tick() {
  renderDate();
  renderSky(document.querySelector('.topbar'));
}
setInterval(tick, 60_000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });

window.addEventListener('hashchange', render);
tick();
render();
requestPersistence();

if ('serviceWorker' in navigator) {
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
