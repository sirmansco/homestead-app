'use client';
import { useEffect } from 'react';
import { useUser } from '@clerk/nextjs';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!;

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

const RETRY_DELAYS_MS = [500, 1500, 3000];

// iOS PWA: pushManager.subscribe() can fail immediately after serviceWorker.ready
// because the SW activation and push registration aren't synchronized on first install.
// Retry with exponential backoff so transient activation-timing failures self-heal.
async function subscribeWithRetry(reg: ServiceWorkerRegistration): Promise<PushSubscription> {
  let lastErr: unknown;
  for (let i = 0; i <= RETRY_DELAYS_MS.length; i++) {
    try {
      const existing = await reg.pushManager.getSubscription();
      if (existing) return existing;
      return await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    } catch (err) {
      lastErr = err;
      if (i < RETRY_DELAYS_MS.length) {
        console.warn(`[push:registrar] subscribe attempt ${i + 1} failed, retrying in ${RETRY_DELAYS_MS[i]}ms`, err instanceof Error ? err.message : String(err));
        await new Promise(r => setTimeout(r, RETRY_DELAYS_MS[i]));
      }
    }
  }
  throw lastErr;
}

export function PushRegistrar() {
  const { isSignedIn } = useUser();

  useEffect(() => {
    if (!isSignedIn) return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

    async function register() {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js');
        await navigator.serviceWorker.ready;

        // Check for a new SW at most once per 24 hours. The browser already
        // checks on every navigation; calling reg.update() on every mount was
        // forcing a SW byte-fetch on every page load, which triggered a SW
        // re-install cycle and a visible reload on every PWA open after a deploy.
        const UPDATE_INTERVAL_MS = 24 * 60 * 60 * 1000;
        const lastUpdateKey = 'hs.sw.lastUpdate';
        const lastUpdate = Number(localStorage.getItem(lastUpdateKey) || '0');
        if (Date.now() - lastUpdate > UPDATE_INTERVAL_MS) {
          try {
            await reg.update();
            localStorage.setItem(lastUpdateKey, String(Date.now()));
          } catch { /* ignore — non-critical */ }
        }

        // Only subscribe if permission already granted — don't prompt here
        if (Notification.permission !== 'granted') return;

        const sub = await subscribeWithRetry(reg);
        const res = await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(sub.toJSON()),
        });
        if (!res.ok) {
          console.error('[push:registrar] /api/push/subscribe returned', res.status);
        }
      } catch (err) {
        console.warn('[push:registrar] registration or subscribe failed', err instanceof Error ? err.message : String(err));
      }
    }

    register();
  }, [isSignedIn]);

  return null;
}

export type PushPermissionResult = { ok: true } | { ok: false; reason: string };

// Call this to prompt for permission and subscribe
export async function requestPushPermission(): Promise<PushPermissionResult> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { ok: false, reason: 'push_not_supported' };
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return { ok: false, reason: `permission_${permission}` };
  }

  try {
    if (!VAPID_PUBLIC_KEY) {
      console.error('[push:registrar] NEXT_PUBLIC_VAPID_PUBLIC_KEY is not set');
      return { ok: false, reason: 'vapid_key_missing' };
    }
    const reg = await navigator.serviceWorker.ready;
    const sub = await subscribeWithRetry(reg);

    const res = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sub.toJSON()),
    });

    if (!res.ok) {
      console.error('[push:registrar] /api/push/subscribe returned', res.status);
      return { ok: false, reason: `subscribe_api_${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[push:registrar] subscribe failed:', msg);
    return { ok: false, reason: msg };
  }
}
