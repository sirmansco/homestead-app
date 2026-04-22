'use client';
import { useEffect } from 'react';
import { useUser } from '@clerk/nextjs';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!;
// Bump this in lockstep with SW_VERSION in public/sw.js. When they differ, the
// client forces an SW update so users don't get stuck on stale caches.
const EXPECTED_SW_VERSION = 'hs-sw-2026-04-22-1';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

async function getActiveSwVersion(reg: ServiceWorkerRegistration): Promise<string | null> {
  const sw = reg.active;
  if (!sw) return null;
  return new Promise<string | null>(resolve => {
    const channel = new MessageChannel();
    const timeout = setTimeout(() => resolve(null), 1500);
    channel.port1.onmessage = (e) => {
      clearTimeout(timeout);
      resolve(e.data?.version ?? null);
    };
    try {
      sw.postMessage({ type: 'GET_VERSION' }, [channel.port2]);
    } catch {
      clearTimeout(timeout);
      resolve(null);
    }
  });
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

        // Force update check — if the SW file changed on the server, this
        // fetches the new one. Our SW calls skipWaiting() so it activates
        // immediately on install.
        try { await reg.update(); } catch { /* ignore */ }

        // Version check: compare active SW version to expected. If they
        // mismatch after an update, the old SW didn't claim yet — reload
        // once to pick up the new controller.
        const active = await getActiveSwVersion(reg);
        if (active && active !== EXPECTED_SW_VERSION) {
          console.log(`[sw] version mismatch: active=${active} expected=${EXPECTED_SW_VERSION} — waiting for claim`);
          // Wait for the next controllerchange event, then reload
          navigator.serviceWorker.addEventListener('controllerchange', () => {
            // Avoid infinite reload loops with a session flag
            if (!sessionStorage.getItem('hs.sw.reloaded')) {
              sessionStorage.setItem('hs.sw.reloaded', '1');
              window.location.reload();
            }
          }, { once: true });
        } else {
          sessionStorage.removeItem('hs.sw.reloaded');
        }

        // Only subscribe if permission already granted — don't prompt here
        const permission = Notification.permission;
        if (permission !== 'granted') return;

        const existing = await reg.pushManager.getSubscription();
        const sub = existing || await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });

        await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(sub.toJSON()),
        });
      } catch {
        // SW or push not supported — silent fail
      }
    }

    register();
  }, [isSignedIn]);

  return null;
}

// Call this to prompt for permission and subscribe
export async function requestPushPermission(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return false;

  try {
    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    const sub = existing || await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });

    const res = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sub.toJSON()),
    });

    return res.ok;
  } catch {
    return false;
  }
}
