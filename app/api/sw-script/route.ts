import { NextResponse } from 'next/server';
import { getCopy } from '@/lib/copy';

// Serves the service worker JS with the current deploy SHA embedded.
// Because the SW file content changes on every deploy (the SHA changes),
// the browser byte-compares it against the installed SW and installs the
// new version automatically — no manual SW_VERSION bump required.
//
// Mapped from /sw.js via next.config.ts rewrites so the SW scope stays at /.

const DEPLOY_SHA = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'dev';
const CACHE_VERSION = process.env.COVEY_BRAND_ACTIVE === 'true' ? 'covey-v2' : 'hs-v1';

export async function GET() {
  const t = getCopy();
  const brandName = t.brand.name;
  const defaultTag = brandName.toLowerCase();
  const swContent = `
// ${brandName} Service Worker — build ${DEPLOY_SHA} — cache ${CACHE_VERSION}
// This comment changes every deploy so the browser detects a new SW automatically.

self.addEventListener('install', () => {
  // Activate immediately — skip the "waiting" phase.
  // Safe because we don't cache routable assets; Next.js handles that.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Take control of all open tabs immediately, then tell every open client to
  // reload so they get the new JS/HTML. iOS PWA ignores Cache-Control headers
  // on the HTML shell — this SW message is the only reliable silent trigger.
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
    payload = { title: '${brandName}', body: event.data.text() };
  }

  const title = payload.title || '${brandName}';
  const options = {
    body: payload.body || '',
    icon: '/icon-192',
    badge: '/icon-192',
    tag: payload.tag || '${defaultTag}',
    data: { url: payload.url || '/' },
    requireInteraction: payload.urgent === true,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  const targetUrl = new URL(url, self.location.origin).toString();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          try {
            await client.navigate(targetUrl);
          } catch (e) {
            // navigate can throw on cross-origin or restricted URLs; fall back to focus only.
            console.warn('[sw:notificationclick] navigate failed', e);
          }
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});
`.trim();

  return new NextResponse(swContent, {
    headers: {
      'Content-Type': 'application/javascript',
      // Never cache — browser must check for a new SW on every registration call.
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Service-Worker-Allowed': '/',
    },
  });
}
