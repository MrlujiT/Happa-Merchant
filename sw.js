const CACHE = 'happa-v75';
const SHELL = [
  '/',
  '/index.html',
  '/happa-logo.jpg',
  '/happa-customer-logo.jpg',
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

/* ── Push Notifications ── */
self.addEventListener('push', e => {
  let data = {};
  try { data = e.data?.json() || {}; } catch(_) { data = { title: e.data?.text() || 'Happa' }; }
  const title = data.title || 'Happa Agent';
  e.waitUntil(self.registration.showNotification(title, {
    body: data.body || '',
    icon: '/happa-logo.jpg',
    badge: '/happa-logo.jpg',
    tag: data.tag || 'happa-push',
    renotify: !!data.tag,
    data: { url: data.url || '/index.html' }
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.url || '/agent.html';
  e.waitUntil(
    clients.matchAll({ type:'window', includeUncontrolled:true }).then(wins => {
      const match = wins.find(w => w.url.includes(url));
      if (match) return match.focus();
      return clients.openWindow(url || '/index.html');
    })
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
