// Bewaart de app-bestanden zodat het startscherm ook laadt als de wifi even weg is.
const CACHE = 'keuken-v7';
const BESTANDEN = ['./', 'index.html', 'style.css?v=7', 'app.js?v=7', 'wallpaper.svg', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(BESTANDEN)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((namen) =>
    Promise.all(namen.filter((n) => n !== CACHE).map((n) => caches.delete(n)))
  ));
  self.clients.claim();
});

// Eerst het netwerk proberen (zodat updates direct zichtbaar zijn), anders de bewaarde versie.
self.addEventListener('fetch', (e) => {
  // Alleen de eigen app-bestanden; de agenda en recepten komen altijd vers van internet.
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((antwoord) => {
        const kopie = antwoord.clone();
        caches.open(CACHE).then((c) => c.put(e.request, kopie));
        return antwoord;
      })
      .catch(() => caches.match(e.request))
  );
});
