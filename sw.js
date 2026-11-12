// Offline cache for the app shell, plus the Android "Share" target for slip images.
const CACHE = 'slip-ledger-v6';
const SHARED = 'shared-slips';
const SHELL = ['./', './index.html', './app.js', './manifest.webmanifest', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== SHARED).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Images shared from another app arrive as a POST; keep them until the page picks them up.
  if (e.request.method === 'POST' && url.pathname.endsWith('/share-target')) {
    e.respondWith((async () => {
      try {
        const form = await e.request.formData();
        const cache = await caches.open(SHARED);
        let i = 0;
        for (const f of form.getAll('slips')) {
          if (f && f.type && f.type.startsWith('image/')) {
            await cache.put(new URL('shared/' + Date.now() + '-' + (i++), self.registration.scope).href,
              new Response(f, {headers: {'Content-Type': f.type}}));
          }
        }
      } catch (err) {}
      return Response.redirect(new URL('./?shared=1', self.registration.scope).href, 303);
    })());
    return;
  }

  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Serve from cache right away, refresh the copy in the background.
  e.respondWith(
    caches.match(e.request, {ignoreSearch: true}).then(hit => {
      const net = fetch(e.request).then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
        return res;
      }).catch(() => hit || caches.match('./index.html'));
      return hit || net;
    })
  );
});
