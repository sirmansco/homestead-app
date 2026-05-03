---
title: Push notifications — enterprise-grade reliability for iOS PWA
status: paused — to resume later
created: 2026-05-03
owner: Matt
scope: production-grade fix that holds at 10K+ users across iOS, Android, desktop, with observability, alerting, and graceful degradation
---

## Problem

After a full chain of fixes today (PRs #83, #84, #85, #86) push notifications still don't reach Meredith's iPhone. The remaining failure isn't on the server — her iPhone is not registering a push subscription at all (zero rows in `push_subscriptions` for her user_id).

But the deeper problem is structural. Today's incident chain — frozen build bundles, broken VAPID keys, silent registration failures, no telemetry, no recovery path — is the symptom of a push system that was built for the happy path and has no defense-in-depth. We need a fix that an on-call engineer at 10K users can trust to hold during a 3am page, not one that requires Matt to drive each individual user back to working state.

Matt deleted both PWAs and cleared Safari Advanced Data before pausing the session.

## What's already shipped (live in production at SHA e4d86f1)

- **PR #85** — `lib/push.ts` reads `process.env.VAPID_PUBLIC_KEY` (no NEXT_PUBLIC_ prefix) so server-side keys are read at runtime, not inlined into the build bundle. Solves the original frozen-bad-key incident.
- **PR #86** — `PushRegistrar.subscribeWithRetry()` byte-compares `existing.options.applicationServerKey` to the current public key; on mismatch, unsubscribes and resubscribes. `classifyWebPushError()` now prunes on Apple `BadJwtToken`/`ExpiredJwtToken` (was retry). Together these auto-heal a key rotation across the user base — no uninstall instructions needed.
- **VAPID env in Vercel** — fully reset: removed all three vars (Production + Preview), regenerated a clean keypair via `npx web-push generate-vapid-keys --json`, validated with `setVapidDetails()` locally, set fresh values via `vercel env add` (no copy-paste path). Production deploy `dpl_AQPzAbESez6kXKNHXfXZem814gkU` triggered.
- **Database wipe** — all 8 stale `push_subscriptions` rows deleted (signed against dead keys).

## Verified state at pause

- Server signs JWTs cleanly — "Vapid public key must be URL safe Base 64" error gone.
- Server prunes on `BadJwtToken` — verified: Meredith's stale sub got auto-pruned by a test lantern.
- Matt's laptop self-healed to a fresh FCM sub bound to the new public key.
- Meredith's iPhone has registered **zero** subs — never created one against the new key.
- Both PWAs deleted by Matt + site data cleared via Safari Advanced Settings before session pause.

## Suspect ranking (from codebase audit agent — full report in session transcript)

1. **Stale SW from pre-VAPID install** — addressed by Matt's PWA deletion + cache clear.
2. **`NEXT_PUBLIC_VAPID_PUBLIC_KEY` mismatch with server `VAPID_PUBLIC_KEY`** — both set in Vercel from the same `web-push generate-vapid-keys --json` output, but worth a side-by-side string verification when work resumes.
3. **`Notification.permission !== 'granted'`** — registrar's auto-mount path bails silently before any logging or telemetry. No way to detect remotely without a diagnostic.
4. **iOS WebKit null-keys subscription bug** — guarded against in code, but if the unsubscribe step fails the null keys slip to the API which 400s.
5. **SW activation race** — three retries with backoff in code; if all three fail, error is swallowed.
6. **`/api/push/subscribe` rejecting POST for auth reasons** — Clerk session expired, etc.
7. **`gcm_sender_id` in manifest** — confirmed absent. Not a suspect.

## iOS research findings (returned post-pause)

Three new actionable findings:

### Finding 1 — WebKit throws DOMException when subscribing with a different key

Per W3C Push API spec, calling `subscribe({applicationServerKey: B})` when a subscription with key A already exists throws `DOMException: A subscription with a different applicationServerKey already exists; to change the applicationServerKey, unsubscribe then resubscribe`. On iOS, this rejection is frequently swallowed silently because Safari Web Inspector is rarely attached.

**Why our PR #86 auto-heal isn't enough on iOS:** the heal path *is* unsubscribe-then-subscribe, but it runs inside an `async` chain with awaits (the `unsubscribe()` is awaited before `subscribe()` runs). On Safari, the user-gesture context can be lost across awaits, causing the second `subscribe()` to silently no-op even when `Notification.permission === 'granted'`. **This is likely the actual bug for Meredith's iPhone.**

Source: [w3c/push-api#291](https://github.com/w3c/push-api/issues/291), [Apple Developer Forums 725619](https://developer.apple.com/forums/thread/725619).

### Finding 2 — Safari requires a user gesture for `subscribe()` even with `permission === granted`

Chrome doesn't. Our auto-mount registrar in the `useEffect` runs without any user gesture at all on PWA mount, so on iOS Safari it can fail silently after a key rotation even on a fresh install. The fix is to make the heal path button-driven, not effect-driven, on iOS.

### Finding 3 — iOS 18 regression: `getSubscription()` returns null after PWA relaunch

[Apple Developer Forums #770749](https://developer.apple.com/forums/thread/770749) documents an iOS 18 regression where `pushManager.getSubscription()` returns `null` after relaunching the PWA — even though the OS still considers the user subscribed. This means our byte-compare heal path can't detect the stale binding because `getSubscription()` returns `null`, the registrar calls `subscribe()` with the new key, WebKit rejects it because the OS still has a binding to the old key, and the rejection is silent.

### Implication for the resume plan

The current PR #86 auto-heal logic is correct on Chrome/Android but insufficient on iOS Safari. Step 2's `/push-debug` page is still the right first move (gives us the actual DOMException string to confirm), but we should also be prepared to ship one of two follow-up fixes:

- **Cheap fix:** rewrite `subscribeWithRetry` so the unsubscribe-then-subscribe sequence runs synchronously without an `await` between them inside a button click handler. This addresses Findings 1 and 2 in one go.
- **Robust fix:** add a "force re-register" button on the lantern page that wraps the entire heal flow in an explicit user-gesture context. Tells the user "tap here if notifications stop working." Addresses all three findings.

## Resume plan (when ready to pick this back up)

### Step 1 — verify the keys actually match (5 min)

From Matt's laptop browser, on joincovey.co (logged in):

```js
// In DevTools console — confirm the bundle's NEXT_PUBLIC_VAPID_PUBLIC_KEY matches the server's VAPID_PUBLIC_KEY
fetch('/api/diagnostics').then(r => r.json()).then(j => console.log({sha: j.appSha, env: j.env}))
```

Then compare the inlined client key (visible in any chunk JS via DevTools Sources) against the server-side `VAPID_PUBLIC_KEY` in Vercel. Both must be byte-identical.

### Step 2 — ship a `/push-debug` page (45 min, recommended by diagnostic agent)

A new client-only page at `app/push-debug/page.tsx` that runs synchronously on mount and renders the full client push state as JSON for the user to screenshot. Specifically:

- `Notification.permission` value
- `navigator.serviceWorker.getRegistration()` exists / scope / active state
- `pushManager.getSubscription()` result
- If a sub exists: SHA-256 hash of `applicationServerKey` (not raw bytes — keep it hashable for comparison)
- Bundle's `NEXT_PUBLIC_VAPID_PUBLIC_KEY` value (it's public, safe to render)
- `navigator.userAgent`
- `window.matchMedia('(display-mode: standalone)').matches` (confirms PWA install state)
- `NEXT_PUBLIC_APP_SHA`
- Last error message from any subscribe attempt (capture in module-scoped var inside PushRegistrar)

**Critical:** runs *before* any `Notification.permission !== 'granted'` early-return, so we see permission state itself.

Why ship this: the existing flow has zero remote visibility. Without telemetry or a debug page, every iOS push diagnosis requires Matt physically holding the device. `/push-debug` makes any failure a 30-second screenshot away.

### Step 3 — fresh installs + tap enable (5 min)

1. Matt: Safari → joincovey.co → Share → Add to Home Screen → open from home screen → sign in → tap enable on lantern page → allow.
2. Meredith: same.
3. Both navigate to `/push-debug` and screenshot the result.

### Step 4 — read the screenshots, identify the actual failure mode

The debug page will tell us in plain text which suspect (#1-#7 above) is actually firing. Then we ship a targeted fix instead of guessing.

### Step 5 — production verification

From Matt's laptop browser (logged in, with fresh sub registered):

```js
fetch('/api/lantern', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({reason: 'Sick kid', startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + 60*60*1000).toISOString()}),
}).then(r => r.json()).then(j => JSON.stringify(j.notify, null, 2))
```

Expected outcome on success: `notify.kind === 'ok'` (or equivalent), `delivered: 1`, Meredith's phone buzzes.

## Anchors (must not break)

- `lib/push.ts:ensureVapid()` reads `VAPID_PUBLIC_KEY` (not NEXT_PUBLIC_) — load-bearing for the build-bundle freeze fix.
- `PushRegistrar.subscribeWithRetry()` byte-compares applicationServerKey before reusing existing sub.
- `classifyWebPushError()` prunes on `BadJwtToken`/`ExpiredJwtToken` — coupled with client auto-resubscribe.
- All three regression tests in `tests/push-classification.test.ts` and `tests/push-registrar-retry.test.ts` must stay green.

## Graveyard

- 2026-05-03 — tried setting `NEXT_PUBLIC_VAPID_PUBLIC_KEY` server-side. Failed because Next.js inlines NEXT_PUBLIC_ vars into the build bundle, so any prior bad key stays frozen across deploys until a fresh build. Fix: split server var (`VAPID_PUBLIC_KEY`) from client var (`NEXT_PUBLIC_VAPID_PUBLIC_KEY`).
- 2026-05-03 — tried "user toggles notifications off/on" as the user-side recovery for a key rotation. Failed because iOS service worker reuses cached `applicationServerKey` even across resubscribe; the existing-sub return path in PushRegistrar never noticed the binding mismatch. Fix: byte-compare in subscribeWithRetry.
- 2026-05-03 — tried "tell users to uninstall and reinstall the PWA" as the recovery path. Rejected as unworkable for 10K+ users — replaced with auto-heal in PR #86.

## Fragile areas

- `PushRegistrar.tsx` line 106 — `if (Notification.permission !== 'granted') return;` — silent bail with zero telemetry. Any diagnostic must run before this.
- `app/api/sw-script` (or wherever `sw.js` is served from) — dynamic per deploy via `DEPLOY_SHA`, but iOS PWA caches aggressively and may not detect updates without a foreground reload.
- `web-push` library's input validation throws synchronously inside `setVapidDetails()` — any malformed env var kills `ensureVapid()` for the entire lambda invocation.

## Notes for resuming

- Matt has Vercel CLI authenticated as `mjsirmans` — env var changes can be made directly via `vercel env add/rm` instead of dashboard navigation.
- Production DATABASE_URL is in `/tmp/covey-env-check/.env.prod.real` from earlier session (`vercel env pull`). Re-pull if stale.
- DB postgres driver is at `node_modules/postgres` — use that for direct queries, not `@neondatabase/serverless` (not installed).
- Three background research agents were spawned. Two completed (codebase audit, diagnostic design). One still running at pause (iOS research). Whoever resumes should check session transcript for the iOS agent's findings before designing the final fix.
