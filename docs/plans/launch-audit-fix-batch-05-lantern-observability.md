---
title: Launch fix batch 05 — Lantern silent-success + notification observability
date: 2026-05-02
status: pending
governs: L13, L16, L29
parent-audit: docs/plans/launch-audit-2026-05-02/synthesis.md
batch-id: B5
prereqs: B4 (eligible-set correctness)
unblocks: B6
---

## Spec

After this batch, no path in the lantern fan-out can claim success when zero pushes were attempted, VAPID is misconfigured, or a server-side subscribe failed silently. Specifically:

1. **L13 server side** — `lib/notify.ts:267-274` returns the structured outcome from `pushToUsers()`: `{ eligibleUsers, attemptedSubscriptions, delivered, stale, failed, reason }`. `POST /api/bell` surfaces those fields verbatim instead of synthesizing `{ sent: innerCircle.length }`.
2. **L13 client side** — `app/components/PushRegistrar.tsx:90-96` and `app/components/ScreenSettings.tsx:69-72,241` track a separate `subscriptionState` distinct from `Notification.permission`. UI shows "Push notifications enabled" only when both browser permission AND server subscription succeed.
3. **L16** — Every early-return path in `lib/notify.ts` (lines 15-16, 49, 128-135, 265, 294, 327-328) emits one structured log line: `{ event, context, status: 'suppressed' | 'sent' | 'failed', recipients, reason }`. Helper: `logNotifyOutcome(...)`.
4. **L29** — `app/context/AppDataContext.tsx:98,134,165` bare `catch {}` blocks call `Sentry.captureException(err)` and `console.warn` with stable tag.

**Done criteria:** A bell ring with eligible caregivers but zero `push_subscriptions` returns `notifySent: 0` (or explicit reason) and emits a structured log line. UI does not show enabled state when subscribe fails. Sentry receives client-side fetch errors. Regression tests exist for each L#.

**Out of scope:** Push subscription deduplication (B7/L18); push pruning (B7/L17); cron observability (B6).

## Conventions

Pattern scan (`lib/notify.ts`, `lib/push.ts`):
- `lib/push.ts` already returns structured `PushResult` at lines 57-58 (`vapid_not_configured`) and 147-155 (`attempted: 0`); the gap is in `lib/notify.ts` discarding it.
- `lib/notify.ts` uses `console.log('[notify:email] ...')` and `[push_batch]` tags; new helper extends that style.
- `app/components/PushRegistrar.tsx:54` already logs to console on automatic registration failure; pattern exists, just not propagated to UI state.
- Sentry configs are at repo root (`sentry.client.config.ts` etc.); import as `import * as Sentry from '@sentry/nextjs'`.

## File map

- `lib/notify.ts:267-274` — propagate `PushResult`; remove synthetic `sent`.
- `lib/notify.ts` — add `logNotifyOutcome()` helper; call at every early-return path (lines noted in spec).
- `app/api/bell/route.ts` — surface structured outcome in response JSON.
- `app/components/PushRegistrar.tsx:90-96` — return `{ ok, reason, subscriptionState }`.
- `app/components/ScreenSettings.tsx:69-72,241` — read `subscriptionState`, not `Notification.permission`, for the enabled banner.
- `app/components/ScreenLantern.tsx:156-157` — same correction.
- `app/context/AppDataContext.tsx:98,134,165` — replace bare catches with `Sentry.captureException(err); console.warn('[appdata:bell|shifts|village]', err)`.
- `tests/bell-notify-result.test.ts` — regression for L13 server.
- `tests/push-permission-ui.test.tsx` — regression for L13 client.
- `tests/notification-observability.test.ts` — regression for L16.
- `tests/app-data-context-errors.test.ts` — regression for L29.

## Graveyard

(empty)

## Anchors

- `lib/push.ts:57-58, 147-155` already returns structured `PushResult`; do not regress.
- `app/api/diagnostics/route.ts` lantern-recipient verdict already part of the observability bar; do not duplicate logic — this batch surfaces the same information through the lantern hot path.

## Fragile areas

- `lib/notify.ts` has many early-return paths; one shared helper avoids drift but the helper signature must accept all the contexts cleanly.
- Client-side `subscriptionState` change is a UI behavior change that the user will visibly notice when push setup actually fails; surface to user before merge.
- `AppDataContext` polling — adding Sentry calls to a 10s polling loop on errors can flood Sentry during a partial outage. Use Sentry's built-in deduplication and a `console.warn` floor.

## Regression tests required (Hard Rule #6)

Listed in the file map. Each asserts the falsifiable root cause from synthesis L13/L16/L29.
