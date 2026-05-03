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

The current PR #86 auto-heal logic is correct on Chrome/Android but insufficient on iOS Safari. The cheap-fix patches won't satisfy enterprise reliability — they'd just postpone the next incident.

## Enterprise-grade design (the real fix)

The system must be:
- **Self-healing without user action** wherever the platform allows
- **User-recoverable in one tap** wherever the platform requires a gesture (iOS)
- **Observable end-to-end** so any operator can diagnose any user's push state in under 60 seconds
- **Alerting** so we discover broken push *before* a user reports it
- **Resilient to env-var corruption** so the next bad-key paste doesn't take down delivery
- **Graceful in degradation** — when push fails, fall back to email/SMS/in-app banner without losing the message
- **Documented** in a runbook an on-call engineer can execute cold

### Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CLIENT (PushRegistrar)                        │
│                                                                      │
│  ┌───────────────────┐         ┌──────────────────────────────┐    │
│  │ Auto-heal effect  │         │ User-gesture re-register     │    │
│  │ (Chrome/Android)  │         │ button (iOS, all platforms)  │    │
│  │ • byte-compare    │         │ • synchronous unsubscribe→   │    │
│  │ • drop+resubscribe│         │   subscribe in click handler │    │
│  │ • no await between│         │ • surfaces DOMException to UI│    │
│  └────────┬──────────┘         └──────────────┬───────────────┘    │
│           │                                   │                     │
│           └───────────┬───────────────────────┘                     │
│                       │                                             │
│                       ▼                                             │
│           ┌─────────────────────────┐                              │
│           │ /api/push/health (POST) │  always — even on failure    │
│           │ captures state snapshot │  even on permission=denied   │
│           └────────────┬────────────┘                              │
└────────────────────────┼────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│                          SERVER                                      │
│                                                                      │
│  push_health table (per-user, last 5 attempts)                      │
│       │                                                              │
│       ├─→ /api/diagnostics (operator view, gated to DEV_EMAILS)     │
│       │                                                              │
│       ├─→ /api/push/health/:userId (admin view of any user)         │
│       │                                                              │
│       └─→ Sentry breadcrumb on any error.name                       │
│                                                                      │
│  push_subscriptions                                                  │
│       │                                                              │
│       ├─→ ensureVapid() validates keys with try/catch — never throws│
│       │   (degrade to email fallback, log, alert)                   │
│       │                                                              │
│       ├─→ classifyWebPushError() prunes BadJwt/Expired/410/404      │
│       │                                                              │
│       └─→ on prune: emit `push_pruned` event for downstream          │
│                                                                      │
│  notifyBellRing()                                                    │
│       │                                                              │
│       ├─→ try push (existing path)                                  │
│       │                                                              │
│       └─→ if delivered === 0 AND eligible > 0:                      │
│           • email fallback via Resend                               │
│           • in-app notification banner on next app open             │
│           • emit `push_undelivered` Sentry alert                    │
└─────────────────────────────────────────────────────────────────────┘
```

### Components

#### 1. Client: dual-path registrar
**File:** `app/components/PushRegistrar.tsx`

- **Effect path** (current behaviour, hardened): byte-compares applicationServerKey, auto-heals on mismatch. Sends `pushHealth` POST regardless of outcome — including the silent `Notification.permission !== 'granted'` early-return case (instrument *before* the bail).
- **Button path** (new): export a `ForceReregisterButton` component used on the lantern page and in settings. Wraps `unsubscribe() → subscribe()` in a single synchronous chain inside the click handler, no awaits between them. iOS Safari's user-gesture context survives. Surfaces any DOMException to the UI so the user sees what happened.

#### 2. Health telemetry endpoint
**File:** `app/api/push/health/route.ts` (new)

POST accepts: `{permission, hasRegistration, hasSubscription, applicationServerKeyHash, clientVapidFingerprint, lastErrorName, lastErrorMessage, userAgent, isStandalone, appSha}`. Auth-gated via `requireUser`. Inserts into `push_health`, prunes older than last 5 per user. Truncates error messages to 500 chars.

#### 3. push_health table
**File:** `lib/db/schema.ts` + drizzle migration

Schema per the diagnostic agent's spec — append-only with last-N-per-user retention, indexed on (user_id, created_at desc). Privacy: hash applicationServerKey rather than store raw bytes; store fingerprint of NEXT_PUBLIC_VAPID_PUBLIC_KEY (`first8..last8:length`), not full key.

#### 4. Operator diagnostics surface
**Files:** `app/api/diagnostics/route.ts` extended; new `app/(authed)/admin/push-health/page.tsx`

- `/api/diagnostics` extended to include `pushHealth` block — most recent record for each household member of the caller.
- `/admin/push-health` admin-only page (gated to `DEV_EMAILS`) showing a table of all users with their most recent health snapshot, color-coded by status (green = sub registered & matches current key, yellow = permission default, red = error).

#### 5. Server: defensive ensureVapid
**File:** `lib/push.ts`

Currently `setVapidDetails` throws synchronously inside `ensureVapid()` on bad keys, killing the entire lambda invocation. Wrap in try/catch — on failure, emit Sentry alert `vapid_init_failed` and return false. The route returns `vapid_misconfigured` instead of 500. Push falls back to email/in-app paths.

#### 6. Email fallback for undelivered pushes
**File:** `lib/notify.ts`

If `notifyBellRing()` results in `delivered === 0 && eligibleInnerCircle.length > 0`, fall through to email via existing Resend integration. The lantern message is delivered; the user just gets it via email instead of push. Emit `push_undelivered` Sentry breadcrumb with the recipient list and reason.

#### 7. In-app banner on next session
**File:** new `app/components/UndeliveredLanternBanner.tsx`

When a recipient opens the PWA, check for unhandled lanterns from the last 6 hours that targeted them. If any, show a banner. This catches the case where push failed AND email was delayed AND the user happens to open the app — they still see the urgent signal.

#### 8. Alerting
**File:** `lib/push.ts`, `lib/notify.ts`

Three Sentry alerts (paged on first instance, not just logged):
- `vapid_init_failed` — keys won't parse, push entirely down
- `push_undelivered_to_eligible` — push attempted but 0 delivered to ≥1 eligible recipient
- `push_health_consistent_failures` — same user has 3+ failed `/api/push/health` records in a row

#### 9. Runbook
**File:** `docs/runbooks/push-notifications.md` (new)

Operator-facing doc covering: how to read `/admin/push-health`, how to force-rotate VAPID keys via Vercel CLI safely (the exact `vercel env rm` + `add` sequence used today), how to interpret each `lastErrorName` in the health table, how to manually trigger a sub cleanup, escalation path when alerts fire.

#### 10. Regression tests
- Existing tests stay (PRs #85, #86)
- New: `tests/push-health-instrumentation.test.ts` — registrar always POSTs to `/api/push/health` regardless of outcome
- New: `tests/notify-email-fallback.test.ts` — when `pushToUsers` returns `delivered:0`, email path fires
- New: `tests/ensure-vapid-resilience.test.ts` — malformed VAPID env doesn't throw; returns `vapid_misconfigured`
- New: integration test simulating VAPID rotation → confirms auto-heal fires AND health endpoint records it
- Pressure test in CI: a "lantern delivery contract" test that simulates 100 subs across iOS/Android/Chrome shapes and verifies the prune+heal+fallback chain converges to 100% notification delivery (push or email)

### Sequencing (ship in this order)

1. **Phase 0 — telemetry first** (1 day): `/api/push/health` endpoint + table + registrar instrumentation. Ship before any other change so we can measure baseline failure rate. Operator visibility before any "fix."
2. **Phase 1 — diagnose Meredith** (1 hour): with telemetry live, her PWA reinstall produces a `push_health` row. Read it, confirm which of the seven suspects fires, ship the targeted fix.
3. **Phase 2 — iOS button-path heal** (half day): `ForceReregisterButton` on lantern page + settings, with synchronous unsubscribe-subscribe chain. Tested on real iOS device (TestFlight or live).
4. **Phase 3 — server resilience** (half day): defensive `ensureVapid`, email fallback, in-app banner.
5. **Phase 4 — operator surface** (half day): `/admin/push-health` page, runbook, three Sentry alerts.
6. **Phase 5 — pressure tests** (half day): contract test in CI, simulated rotation drill.

Total: ~3 days of focused work. Each phase ships independently behind no flag — incremental hardening.

### What this buys us at 10K users

- **MTTR for any user's broken push: 60 seconds** (operator opens `/admin/push-health/:user`, reads error, follows runbook).
- **Zero "tell users to uninstall" instructions** — the iOS button-path heal makes recovery a single in-app tap.
- **Push-down incidents are visible immediately** via Sentry alerts, not via user complaints.
- **Notifications never silently drop** — every lantern that's eligible for delivery either pushes, emails, or banners.
- **VAPID rotation becomes routine** — the runbook codifies today's `vercel env rm/add` sequence, and the system self-heals after rotation.

### Anti-goals (what we are NOT doing)

- Building a custom push relay or replacing `web-push`. Off the shelf is fine.
- Migrating to native iOS app for push. PWA push is sufficient with the above hardening.
- Per-user retry queues. Apple/FCM already retry; layering our own creates double-delivery risk.
- "Reinstall the PWA" as a documented user instruction. That's a regression.

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
