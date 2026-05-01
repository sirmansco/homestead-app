// Service Worker — local dev fallback.
// In production, /sw.js is served by /api/sw-script with the deploy SHA
// embedded so the browser auto-detects new deployments.

self.addEventListener('install', () => {
  // Activate this SW immediately instead of waiting for old tabs to close.
  // Safe because our SW doesn't cache routable assets — Next handles that.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Take control of open pages right away, then tell every open client to
  // reload so they get the freshly deployed JS/HTML. iOS PWA ignores
  // Cache-Control headers on the HTML shell — the SW message is the only
  // reliable trigger for a silent in-place refresh.
  event.waitUntil(
    self.clients.claim().then(() =>
      self.clients.matchAll({ type: 'window', includeUncontrolled: false }).then(clientList => {
        clientList.forEach(client => client.postMessage({ type: 'SW_ACTIVATED' }));
      })
    )
  );
});

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'App', body: event.data.text() };
  }

  const title = payload.title || 'App';
  const options = {
    body: payload.body || '',
    icon: '/icon-192',
    badge: '/icon-192',
    tag: payload.tag || 'homestead',
    data: { url: payload.url || '/' },
    requireInteraction: payload.urgent === true,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
