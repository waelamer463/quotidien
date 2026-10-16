import { getData, update, requestPersistence } from './storage.js';

const views = {
  habitudes: {
    title: 'Habitudes',
    render: () => `
      <div class="card">
        <h2>Tes habitudes du jour</h2>
        <p class="muted">Bientôt ici : saisie rapide, séries et graphiques.</p>
      </div>`,
  },
  planning: {
    title: 'Planning',
    render: () => `
      <div class="card">
        <h2>Ta journée</h2>
        <p class="muted">Bientôt ici : prières, blocs de travail et tâches.</p>
      </div>`,
  },
};

function currentTab() {
  const hash = location.hash.slice(1);
  return views[hash] ? hash : getData().settings.lastTab;
}

function render() {
  const tab = currentTab();
  document.getElementById('view-title').textContent = views[tab].title;
  document.getElementById('view').innerHTML = views[tab].render();
  document.querySelectorAll('.tabbar a').forEach(a => {
    a.classList.toggle('active', a.dataset.tab === tab);
  });
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
  navigator.serviceWorker.register('sw.js');
}
