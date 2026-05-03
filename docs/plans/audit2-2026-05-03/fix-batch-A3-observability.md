---
title: Audit-2 fix batch A3 — Observability + account-deletion notify
date: 2026-05-03
status: planned
governs: F-P2-J, T-A, T-D, F-P3-G
parent-audit: docs/plans/audit2-2026-05-03/fix-sequence.md
batch-id: A3
prereqs: none
unblocks: nothing (A1, A2, A4 are independent)
---

## Spec

After this batch:

1. **F-P2-J** — `sentry.client.config.ts` gains a startup `console.warn` when
   `NEXT_PUBLIC_SENTRY_DSN` is absent in production (matching the existing server-config
   guard). Client-side Sentry errors now surface a warning in Vercel function logs if the
   public DSN var is not set.

2. **T-A** — `lib/bell-escalation.ts` emits a structured JSON log line on successful
   escalation: `{ event: 'bell_escalated', bellId, at }`. Currently the function returns
   silently after the atomic UPDATE succeeds — there is no success log, only an error log.

3. **T-D** — `app/api/household/route.ts` PATCH emits a structured JSON log line when
   `setupCompleteAt` is written: `{ event: 'setup_complete', householdId, at }`. Currently
   there is no log at setup completion; a funnel break (user completes setup but never
   returns) would be invisible.

4. **F-P3-G** — `app/api/account/route.ts` DELETE calls `notifyShiftCancelled` for each
   future shift that is bulk-cancelled on behalf of the departing user. Currently those
   shifts are silently cancelled — claimers are never notified. Iterates
   `futureCancelled` (already collected as `{ id: shifts.id }[]`) and calls
   `notifyShiftCancelled(shift.id)` for each.

**Done criteria:**

- `sentry.client.config.ts` contains `console.warn` and `NEXT_PUBLIC_SENTRY_DSN`.
- `grep -n "bell_escalated" lib/bell-escalation.ts` returns a match.
- `grep -n "setup_complete" app/api/household/route.ts` returns a match.
- `grep -n "notifyShiftCancelled" app/api/account/route.ts` returns a match.
- Regression tests pass.

**Out of scope:** Adding `NEXT_PUBLIC_SENTRY_DSN` to `.env.example` (already present per
L28 fix — grep confirms); wiring Sentry alerts; changing bell escalation logic.

## Conventions

- Structured log format: `console.log(JSON.stringify({ event, ...fields, at: new Date().toISOString() }))`.
  Match `account_deletion` event format already in account/route.ts.
- `notifyShiftCancelled` is already imported in routes that cancel individual shifts. Check
  the import path in `app/api/whistles/[id]/cancel/route.ts` and mirror it.
- The `sentry.client.config.ts` warn guard pattern: check `!process.env.NEXT_PUBLIC_SENTRY_DSN`
  at module evaluation, only in `NODE_ENV === 'production'`. Same shape as server config.
- `notifyShiftCancelled` errors in the account DELETE loop must not abort the deletion — wrap
  each call in try/catch and log; deletion is the primary concern.

## File map

### `sentry.client.config.ts`

After `Sentry.init({...})`, add:

```ts
if (process.env.NODE_ENV === 'production' && !process.env.NEXT_PUBLIC_SENTRY_DSN) {
  console.warn('[sentry] NEXT_PUBLIC_SENTRY_DSN not set — client-side errors will not be reported');
}
```

### `lib/bell-escalation.ts`

After the `if (updated.length === 0) return;` guard, add:

```ts
console.log(JSON.stringify({ event: 'bell_escalated', bellId, at: new Date().toISOString() }));
```

Place it before the `try { await notifyBellEscalated(bellId); }` block so the log is emitted
even if notify throws.

### `app/api/household/route.ts` — PATCH handler

After `updates.setupCompleteAt = new Date();`, add the log inside the `returning()` callback.
Because the update runs before `Clerk.updateOrganization`, add the log after `const [updated] =
await db.update(...)` returns:

```ts
if (updates.setupCompleteAt) {
  console.log(JSON.stringify({
    event: 'setup_complete',
    householdId: household.id,
    at: new Date().toISOString(),
  }));
}
```

### `app/api/account/route.ts` — DELETE handler

Import `notifyShiftCancelled` at the top of the file. Check import path in
`app/api/whistles/[id]/cancel/route.ts`.

After `cancelledShifts += futureCancelled.length;`, add:

```ts
for (const s of futureCancelled) {
  try {
    await notifyShiftCancelled(s.id);
  } catch (notifyErr) {
    console.error('[account:DELETE] notifyShiftCancelled failed', s.id, notifyErr);
  }
}
```

## Graveyard

(empty)

## Anchors

- `notifyShiftCancelled` is idempotent for shifts that have no claimer — it resolves the
  shift, finds no `claimedByUserId`, and returns early. No risk of spurious push on
  unclaimed shifts.
- `account_deletion` structured log already exists in account/route.ts — the deletion still
  runs regardless of what `notifyShiftCancelled` does.
- The bell escalation log is a pure addition after the atomic guard — it does not affect
  correctness.

## Fragile areas

- `notifyShiftCancelled` makes push calls; if VAPID is not configured in test environment,
  mocking is required. Check existing test setup for `lib/push.ts` mocking patterns.
- `sentry.client.config.ts` runs in the browser bundle — the `console.warn` guard will only
  fire server-side during Next.js build/SSR, not in the browser (where `process.env` is
  inlined at build time). This is acceptable — the intent is to catch misconfigured Vercel
  deployments at build/cold-start time, not at browser runtime.
- The PATCH log fires for every household PATCH, not just first-time setup. This is
  acceptable: `setupCompleteAt` is set on every PATCH (current behavior), so the log
  represents "household profile updated (including first-time setup)". The event name
  `setup_complete` is a slight misnomer — document in a comment if clarity matters.

## Regression tests required (Hard Rule #6)

### `tests/observability-bell-escalation.test.ts` — new file

Covers T-A:

- Successful escalation emits `{ event: 'bell_escalated', bellId }` to console.log
- Race-lost escalation (UPDATE returns 0 rows) emits no log

### `tests/observability-account-deletion.test.ts` — new file

Covers F-P3-G:

- Account DELETE with two future claimed shifts → `notifyShiftCancelled` called twice
- Account DELETE with no future shifts → `notifyShiftCancelled` not called
- `notifyShiftCancelled` throwing does not abort the deletion response (still 200)

### `tests/sentry-client-dsn-warn.test.ts` — new file

Covers F-P2-J (static analysis):

- `sentry.client.config.ts` source contains `NEXT_PUBLIC_SENTRY_DSN`
- `sentry.client.config.ts` source contains `console.warn`
