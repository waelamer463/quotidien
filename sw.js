// Stratégie "réseau d'abord" : en ligne, tu reçois toujours la dernière version ;
// hors ligne, l'app se charge depuis le cache.

const CACHE = 'quotidien-v34';
const FILES = [
  './',
  'index.html',
  'css/style.css',
  'js/app.js',
  'js/storage.js',
  'js/util.js',
  'js/essentials.js',
  'js/today-view.js',
  'js/health-import.js',
  'js/prayers.js',
  'js/planning-defaults.js',
  'js/planning-model.js',
  'js/planning-view.js',
  'js/planning-edit.js',
  'js/sheet.js',
  'js/scheduler.js',
  'js/todo-model.js',
  'js/todo-view.js',
  'js/grid-view.js',
  'js/conflicts.js',
  'js/insights.js',
  'js/stats-view.js',
  'js/backup.js',
  'js/theme.js',
  'js/settings-view.js',
  'js/chrono.js',
  'js/chrono-view.js',
  'js/toast.js',
  'js/revision-defaults.js',
  'js/revision-plan.js',
  'js/revision-feedback.js',
  'js/weekly.js',
  'js/review-view.js',
  'js/course-wizard.js',
  'js/dialog.js',
  'js/empty.js',
  'js/orb.js',
  'js/mascot.js',
  'js/sync.js',
  'js/sync-config.js',
  'js/sync-view.js',
  'js/exams-model.js',
  'js/exams-view.js',
  'js/icons.js',
  'js/sky.js',
  'fonts/geist-latin.woff2',
  'fonts/geist-mono-latin.woff2',
  'fonts/inter-latin.woff2',
  'fonts/jetbrains-mono-latin.woff2',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' }) // toujours vérifier auprès du serveur
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
