// Offline support for the website / home-screen app (not used inside the Android app).
//
// - Pages: network first, falling back to the cached app shell when offline.
// - Built files (./assets/*, hashed and never change): cache first.
// - Everything else on this site (icons, dictionary): cache first, filled on use.
// - Supabase and other sites are never cached; the app keeps progress in IndexedDB and syncs
//   queued reviews itself when the connection returns.
//
// When a new version of the app shell is fetched, its assets are cached and assets from older
// versions are deleted.

const CACHE = 'dargos-ju-v1';
const SHELL = './';

const assetUrls = (html) =>
  [...html.matchAll(/(?:src|href)="(\.\/assets\/[^"]+)"/g)].map((m) => new URL(m[1], self.registration.scope).href);

async function cacheShell(response) {
  const cache = await caches.open(CACHE);
  const html = await response.clone().text();
  const wanted = assetUrls(html);
  await cache.put(new URL(SHELL, self.registration.scope).href, response);
  await Promise.all(
    wanted.map(async (url) => {
      if (!(await cache.match(url))) {
        const res = await fetch(url);
        if (res.ok) await cache.put(url, res);
      }
    }),
  );
  // Drop built files that the current version no longer uses.
  const keep = new Set(wanted);
  for (const req of await cache.keys()) {
    if (req.url.includes('/assets/') && !keep.has(req.url)) await cache.delete(req);
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const res = await fetch(new URL(SHELL, self.registration.scope).href, { cache: 'no-cache' });
      if (res.ok) await cacheShell(res);
      const cache = await caches.open(CACHE);
      await cache.addAll(['./manifest.webmanifest', './icon.svg', './icon-192.png', './apple-touch-icon.png']).catch(() => undefined);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req, { cache: 'no-cache' });
          if (res.ok) event.waitUntil(cacheShell(res.clone()));
          return res;
        } catch {
          const cached = await caches.match(new URL(SHELL, self.registration.scope).href);
          return cached ?? Response.error();
        }
      })(),
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      const res = await fetch(req);
      if (res.ok && res.type === 'basic') {
        const cache = await caches.open(CACHE);
        cache.put(req, res.clone());
      }
      return res;
    })(),
  );
});

// ---- Push notifications ----

self.addEventListener('push', (event) => {
  let msg = { title: 'Dargos Ju', body: '', url: './', tag: undefined };
  try {
    msg = { ...msg, ...event.data.json() };
  } catch {
    /* plain text or empty push */
  }
  event.waitUntil(
    self.registration.showNotification(msg.title, {
      body: msg.body,
      tag: msg.tag,
      icon: './icon-192.png',
      badge: './icon-192.png',
      data: { url: msg.url },
    }),
  );
});

// Tapping a notification opens the app (or focuses it) on the page the notification points to.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url ?? './', self.registration.scope).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = windows.find((w) => w.url.startsWith(self.registration.scope));
      if (open) {
        await open.focus();
        return open.navigate ? open.navigate(target) : open.postMessage({ type: 'open', url: target });
      }
      return self.clients.openWindow(target);
    })(),
  );
});
