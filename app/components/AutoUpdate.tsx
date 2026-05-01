'use client';
import { useEffect } from 'react';

// Silent PWA auto-updater — two complementary mechanisms:
//
// 1. SERVICE WORKER MESSAGE (primary, works on iOS PWA)
//    When a new SW activates it broadcasts SW_ACTIVATED. We reload — but only
//    if a previous SW was already installed (i.e. this is an update, not a
//    first install). First installs do not need a reload; reloading them caused
//    a visible flash/glitch on every PWA launch after a cache version bump.
//
// 2. SHA META-TAG FALLBACK (secondary, for browsers without SW)
//    On first paint we compare the build SHA baked into the <meta> tag against
//    the last-seen SHA in localStorage. Mismatch → reload once.
//
// Neither path touches user data — we only reload the JS/HTML shell.
export function AutoUpdate() {
  useEffect(() => {
    // ── Mechanism 1: SW broadcast ──────────────────────────────────────────
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === 'SW_ACTIVATED') {
        // Only reload on updates (a prior SW version existed), not on first install.
        // reg.waiting != null means a new SW was waiting to replace an active one.
        navigator.serviceWorker?.getRegistration().then(reg => {
          // If there was a previous controller, this is a SW update — reload.
          if (navigator.serviceWorker.controller) {
            window.location.reload();
          }
        });
      }
    };
    navigator.serviceWorker?.addEventListener('message', onMessage);

    // ── Mechanism 2: SHA meta-tag fallback ─────────────────────────────────
    const currentSha = document.querySelector<HTMLMetaElement>('meta[name="app-sha"]')?.content;
    if (currentSha && currentSha !== 'dev') {
      const storedSha = localStorage.getItem('hs.deploy.sha');
      if (!storedSha) {
        localStorage.setItem('hs.deploy.sha', currentSha);
      } else if (storedSha !== currentSha) {
        localStorage.setItem('hs.deploy.sha', currentSha);
        window.location.reload();
      }
    }

    return () => {
      navigator.serviceWorker?.removeEventListener('message', onMessage);
    };
  }, []);

  return null;
}
