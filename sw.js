/* SampledHead Portal · service worker v11
   Solo guarda en caché los archivos del propio portal. Las demás apps (y la lectura en
   directo de sus iconos) pasan siempre directas a la red, sin tocarlas. */
const C = 'sampledhead-portal-v21';
const FILES = ['./', 'index.html', 'styles.css', 'app.js', 'logo.png', 'manifest.webmanifest',
  'eye-white.png', 'eye-pupil.png', 'eye-lid.png', 'icon-192.png', 'icon-512.png',
  'icons/sampledhead-app.png', 'icons/crazyhead.png', 'icons/editor.png', 'icons/spb.svg',
  'icons/poppads.png', 'icons/chuleta-beat.png', 'icons/tuner.png', 'icons/tonopad.svg', 'icons/fuzzhead.png', 'icons/tapehead.png', 'icons/pockethead.png', 'icons/scratchhead.png'];
const SHELL = new Set(FILES.map(f => new URL(f, self.registration.scope).href));

self.addEventListener('install', e => {
  e.waitUntil(caches.open(C).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k.indexOf('sampledhead-portal-') === 0 && k !== C).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url); u.search = ''; u.hash = '';
  if (!SHELL.has(u.href)) return;                 // no es del portal: red directa
  e.respondWith(caches.match(u.href).then(hit => {
    const net = fetch(r).then(res => {
      if (res && res.ok) { const cp = res.clone(); caches.open(C).then(c => c.put(u.href, cp)); }
      return res;
    }).catch(() => hit);
    return hit || net;                             // rápido desde caché y se refresca en segundo plano
  }));
});
