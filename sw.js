/* Le Comptoir — Service Worker */
const CACHE = 'comptoir-v4';
const CORE = [
  './',
  './index.html',
  './styles.css',
  './script.js',
  './manifest.webmanifest',
  './assets/img/logo.jpeg',
  './assets/img/salle.jpg',
  './assets/img/salle2.jpg',
  './assets/img/bar.jpg',
  './assets/img/duo-marbre.jpg',
  './assets/img/banquette.jpg',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/apple-touch-icon.png',
  './assets/video/ambiance.mp4',
  './assets/video/cuisine.mp4',
  './assets/video/cocktail.mp4'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Vidéos : précachées -> on sert depuis le cache si dispo, sinon réseau.
  // (fichiers légers ~2-3 Mo, une réponse 200 complète gère bien la lecture/seek)
  if (/\.(mp4|webm)$/i.test(url.pathname)) {
    e.respondWith(
      caches.match(req, { ignoreVary: true }).then((cached) =>
        cached || fetch(req).then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
      )
    );
    return;
  }

  // HTML, CSS, JS, manifeste : réseau d'abord -> toujours à jour quand en ligne,
  // repli cache hors-ligne. (évite de servir une version périmée)
  if (
    req.mode === 'navigate' ||
    req.destination === 'document' ||
    req.destination === 'style' ||
    req.destination === 'script' ||
    /\.(css|js|webmanifest)$/i.test(url.pathname)
  ) {
    e.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      }).catch(() => caches.match(req).then((r) => r || caches.match('./index.html')))
    );
    return;
  }

  // Reste : cache d'abord, repli réseau (stale-while-revalidate léger)
  e.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req).then((res) => {
        if (res && res.status === 200 && url.origin === location.origin) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
