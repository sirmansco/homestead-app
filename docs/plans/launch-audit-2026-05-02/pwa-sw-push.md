---
title: Launch audit — PWA, service worker, push subscription lifecycle
date: 2026-05-02
domain: PWA, service worker, push subscription lifecycle
auditor: codex
---

## Summary

I read the Domain 5 seed files, the local Next.js 16 metadata/icon docs, and the notification/client paths needed to verify the PWA install, service-worker, and push-subscription lifecycle. The PWA install metadata and icon assets are present, JSON push fallback is implemented, stale push subscriptions are pruned on 404/410, and `/sw.js` is wired to a dynamic route. I found three launch-readiness defects: failed push registration can still be presented as enabled, notification clicks do not navigate existing app windows to the pushed deep link, and push subscription reuse relies on a race-prone application-level upsert with no database uniqueness constraint.

## Findings

### Finding 1 — Push setup failures can be shown as enabled
- **Severity:** blocks-launch
- **Root cause (falsifiable):** The notification enable UI collapses backend subscription failures into browser permission state, so a granted browser permission can be displayed as “Push notifications enabled” even when `/api/push/subscribe` failed.
- **Evidence:** `app/components/PushRegistrar.tsx:90` — `requestPushPermission()` posts the subscription to `/api/push/subscribe`; `app/components/PushRegistrar.tsx:96` — non-OK subscribe responses return `{ ok: false, reason: ... }`; `app/components/ScreenSettings.tsx:69` — `handleEnableNotifications()` calls `requestPushPermission()`; `app/components/ScreenSettings.tsx:72` — failures set `permState` from `Notification.permission` instead of `result.reason`; `app/components/ScreenSettings.tsx:241` — `permState === 'granted'` renders “Push notifications enabled”; `app/components/ScreenLantern.tsx:156` — the lantern banner calls `requestPushPermission()`; `app/components/ScreenLantern.tsx:157` — every non-OK result is mapped to `denied`; `app/components/PushRegistrar.tsx:54` — automatic registration failures are only logged to the console.
- **Why it matters at 5K:** The reliability bar requires bell silent-no-op visibility; at 5K, users can believe urgent lantern push is enabled while no server subscription exists, creating silent push misses for real recipients.
- **Proposed fix (root cause):** Track a separate subscription-registration state in `requestPushPermission()` consumers instead of reusing `Notification.permission`; render actionable client-visible failures for `vapid_key_missing`, `subscribe_api_*`, and thrown subscribe errors, and only show enabled after both browser permission and server registration succeed.
- **Regression test:** Add `tests/push-permission-ui.test.tsx` that mocks `Notification.permission = 'granted'` and `/api/push/subscribe` returning 500, then asserts settings does not render “Push notifications enabled” and the lantern banner does not show the browser-blocked state.
- **Effort:** S
- **Cross-references:** N1

### Finding 2 — Notification clicks focus existing windows without applying the deep link
- **Severity:** should-fix
- **Root cause (falsifiable):** The service worker stores the pushed URL on the notification but, when any same-origin client exists, returns `client.focus()` without navigating that client to the stored URL.
- **Evidence:** `app/api/sw-script/route.ts:57` — push payload URL is stored as `data.url`; `app/api/sw-script/route.ts:66` — notification click reads `event.notification.data?.url`; `app/api/sw-script/route.ts:68` — existing window clients are enumerated; `app/api/sw-script/route.ts:70` — any same-origin client matches; `app/api/sw-script/route.ts:71` — the matched client is focused; `app/api/sw-script/route.ts:74` — `clients.openWindow(url)` is only used when no matching client is found; `lib/notify.ts:271` — lantern pushes include `/?tab=${t.urgentSignal.deepLinkTab}`.
- **Why it matters at 5K:** Lantern and shift notifications are time-sensitive; focusing an already-open app on the wrong tab makes notification clicks fail the expected deep-link workflow even though push delivery succeeded.
- **Proposed fix (root cause):** In the `notificationclick` handler, resolve `url` against `self.location.origin` and call `client.navigate(targetUrl)` before or after `client.focus()` when an existing same-origin window is present; keep `openWindow(targetUrl)` for the no-client path.
- **Regression test:** Add `tests/sw-notification-click.test.ts` that evaluates the generated SW click handler with a mocked same-origin client and asserts a push URL like `/?tab=lantern` calls `client.navigate()` or opens a new window to that URL before focus.
- **Effort:** S
- **Cross-references:** None

### Finding 3 — Push subscription reuse is not enforced at the database boundary
- **Severity:** should-fix
- **Root cause (falsifiable):** `/api/push/subscribe` performs a select-then-insert upsert by `(userId, endpoint)`, but the `push_subscriptions` table has no unique constraint on that key, so concurrent registrations can insert duplicate rows.
- **Evidence:** `app/api/push/subscribe/route.ts:22` — comment says re-subscribing should update keys; `app/api/push/subscribe/route.ts:23` — existing rows are looked up before writing; `app/api/push/subscribe/route.ts:27` — update runs only if the pre-read found a row; `app/api/push/subscribe/route.ts:31` — otherwise a new row is inserted; `lib/db/schema.ts:38` — `users` shows the established Drizzle pattern for table-level uniqueness; `lib/db/schema.ts:88` — `pushSubscriptions` table starts without a table callback; `lib/db/schema.ts:92` — `endpoint` is plain non-null text; `lib/db/schema.ts:96` — the table closes with no uniqueness constraint.
- **Why it matters at 5K:** Duplicate subscriptions produce duplicate visible notifications, inflate fan-out work, and make push attempt counts less trustworthy under the launch bar’s observability requirements.
- **Proposed fix (root cause):** Add a Drizzle unique constraint and migration for `(userId, endpoint)` or endpoint if the same browser endpoint must be globally unique, then replace the manual select-then-insert with a database upsert/on-conflict update.
- **Regression test:** Add `tests/push-subscribe-upsert.test.ts` that issues two concurrent subscribe requests with the same user and endpoint and asserts one `push_subscriptions` row remains with the latest keys.
- **Effort:** S
- **Cross-references:** None

## Out-of-domain observations

- `app/components/ScreenLantern.tsx:120` reimplements date/time formatting locally; this overlaps with AP7 from Domain 4 and is not counted as a Domain 5 finding.

## What I did not check

- I did not run browser automation or Lighthouse; this pass is source-grounded only.
- I did not inspect image pixels beyond listing and `file` metadata for `public/icons/`; the required PNG sizes are present.
- I did not verify production environment values for VAPID keys; I only audited the source paths that consume and surface those failures.

## Summary table

| ID | Severity | Title | Effort | Cross-references |
|---|---|---|---|---|
| PWA1 | blocks-launch | Push setup failures can be shown as enabled | S | N1 |
| PWA2 | should-fix | Notification clicks focus existing windows without applying the deep link | S | None |
| PWA3 | should-fix | Push subscription reuse is not enforced at the database boundary | S | None |
