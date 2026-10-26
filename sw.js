const CACHE = 'happa-v36';
const SHELL = [
  '/',
  '/index.html',
  '/happa-logo.jpg',
  '/manifest.json',
];
// Never cache these — always fetch fresh
const NO_CACHE = ['/admin.html', '/admin'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Always network-only: Supabase API calls and admin page
  if (url.hostname.includes('supabase.co')) return;
  if (NO_CACHE.some(p => url.pathname === p || url.pathname.startsWith(p + '?'))) return;

  // Network-first for everything else
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
