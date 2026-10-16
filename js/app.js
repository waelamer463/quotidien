import { getData, update, requestPersistence } from './storage.js';
import * as habitsView from './habits-view.js';

const views = {
  habitudes: {
    title: 'Habitudes',
    render: habitsView.render,
  },
  planning: {
    title: 'Planning',
    render: el => {
      el.innerHTML = `
        <div class="card">
          <h2>Ta journée</h2>
          <p class="muted">Bientôt ici : prières, blocs de travail et tâches.</p>
        </div>`;
    },
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
  el.onclick = el.onkeydown = null;
  const title = views[tab].render(el, params);
  document.getElementById('view-title').textContent = title || views[tab].title;
  document.querySelectorAll('.tabbar a').forEach(a => {
    a.classList.toggle('active', a.dataset.tab === tab);
  });
  window.scrollTo(0, 0);
  update(d => { d.settings.lastTab = tab; });
}

function renderDate() {
  const txt = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  document.getElementById('today').textContent = txt.charAt(0).toUpperCase() + txt.slice(1);
}

window.addEventListener('hashchange', render);
renderDate();
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
