const CACHE_NAME = "camp-turnier-v1";
const SHELL_FILES = [
  "index.html",
  "manage.html",
  "live.html",
  "css/styles.css",
  "js/app.js",
  "js/manage.js",
  "js/live.js",
  "js/tournament-engine.js",
  "js/csv-parser.js",
  "js/firebase-sync.js",
  "firebase-config.js",
  "manifest.json",
  "icons/icon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return; // Firebase-Requests unangetastet lassen

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((resp) => {
          if (resp.ok) caches.open(CACHE_NAME).then((cache) => cache.put(event.request, resp.clone()));
          return resp;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
