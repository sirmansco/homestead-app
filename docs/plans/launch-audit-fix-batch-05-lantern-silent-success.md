---
title: Launch fix batch 05 — Lantern silent-success (server outcomes + notify logging + AppDataContext error visibility)
date: 2026-05-02
status: pending
governs: L13 (primary, blocks-launch), L16 (paired, should-fix), L29 (paired, should-fix)
parent-audit: docs/plans/launch-audit-2026-05-02/synthesis.md
batch-id: B5
prereqs: none (B4 sha c13e848 merged; theme F closed)
unblocks: none direct; clears synthesis Theme E. Theme G (push correctness — L17/L18/L19) remains independent.
---

## Spec

This batch closes synthesis Theme E (line 335: "L13 + L29 (observability) + L16 (logging) — coordinated, server-then-client"). The theme makes spec NN #4 ("No fire-and-forget notifications. Every send is awaited; failures are logged. No `.catch(() => {})`") **operationally true** in `lib/notify.ts` and `app/context/AppDataContext.tsx` for the first time. Today the spec promise is partially shipped: every `pushToUsers`/`pushToUser` call site in `lib/notify.ts` is awaited inside `try/catch` (so the constitutional letter is met), but the structured `PushResult` returned by `lib/push.ts` is discarded — `notifyBellRing` and `notifyNewShift` synthesize `{ sent: innerCircle.length, eligible: innerCircle.length }` from the recipient count regardless of what actually shipped (vapid_not_configured, zero subscribers, partial failure all collapse to "sent = recipients"). The `/api/bell` POST then surfaces those synthesized counts to `ScreenLantern`, which renders "lit — push delivery failed" only when `notifySent === 0` is mechanically reachable, which it isn't on the happy-path-with-broken-push case. Same shape for `/api/shifts` POST → `ScreenPost`.

**L13 (blocks-launch).** Caller-visible counts can claim success when zero pushes attempted or VAPID missing. Server-side root cause: `lib/notify.ts:267-274` (notifyBellRing) and `:72-99` (notifyNewShift) ignore `PushResult`. Client-side compounder: `app/components/PushRegistrar.tsx:90,96` and `app/components/ScreenSettings.tsx:69-72,241-244` show "Push notifications enabled" based on `Notification.permission` only — `requestPushPermission()` already returns a discriminated `{ ok: true } | { ok: false; reason: string }` (line 65-68), but `ScreenSettings.handleEnableNotifications` discards the reason and resets `permState` to whatever `Notification.permission` reads, which is `'granted'` even when `/api/push/subscribe` returned 500.

**L16 (should-fix, paired).** Notification side-effects have silent no-op early returns. Root cause: `lib/notify.ts:16` (Resend missing or empty list), `:49` (missing shift/household), `:128`+`:135` (claim target absent or creator opted out), `:265` (empty inner circle), `:294` (empty field set), `:328` (no parents opted into bell responses) all `return` without emitting a structured log. Operations cannot distinguish intentional suppression ("creator opted out of claim notifications") from broken pipeline ("the JOIN returned no household for an existing shift").

**L29 (should-fix, paired).** `AppDataContext` swallows polling fetch errors with bare `catch {}`. Root cause: `app/context/AppDataContext.tsx:98-100` (bell), `:134-136` (shifts), `:165-167` (village). Sentry's global handlers do not see these — they're consumed inside `try/catch`. All three client polling fetches silently swallow 5xx.

**Why all three in one batch:** synthesis Theme E specifies them as a coordinated unit. The L13 server contract change touches the `notifyBellRing` / `notifyNewShift` return shape; L16 fires inside the same functions on the early-return paths; L29 is the client-side observability counterpart that turns the new server-side richness into an operational signal when a fetch fails entirely. Splitting would ship L13 with no client-side observability that the new richness is reaching the user (L29 covers that), and L16 alone has no value without L13's reformed return contract. Single PR matches B4's pattern (L14 + L15 paired).

**Done criteria:**
- `lib/notify.ts` `notifyBellRing` and `notifyNewShift` return a discriminated `NotifyResult` (see Pressure-test §1) instead of `{ sent, eligible }`. Every other exported function in `notify.ts` (`notifyShiftClaimed`, `notifyShiftReleased`, `notifyShiftCancelled`, `notifyBellEscalated`, `notifyBellResponse`) returns `void` today and continues to — but each early-return path emits a structured log line per L16.
- `app/api/bell/route.ts` POST surfaces the new outcome shape on the response (`notify` key replacing `notifySent`/`notifyEligible`). `app/api/shifts/route.ts` POST does the same.
- `app/components/ScreenLantern.tsx:217-224` and `app/components/ScreenPost.tsx:144-152` consume the new shape; the user-visible warning copy stays substantively unchanged ("lit — but no caregivers have notifications enabled" / "lit — push delivery failed") but discriminates on `kind` instead of on `sent === 0` heuristics.
- `app/components/PushRegistrar.tsx` `requestPushPermission()` is unchanged (already returns `PushPermissionResult`). `app/components/ScreenSettings.tsx` `handleEnableNotifications` and `permState` machine extended to a four-state shape (see Pressure-test §4) so "granted" is rendered only when `/api/push/subscribe` confirmed the registration. Display row at `:241-244` reads the new state, not raw `Notification.permission`.
- Every early-return path in `lib/notify.ts` listed in L16's root cause emits a `console.log(JSON.stringify({ event: 'notify_*_skip', reason, ...context }))` line before returning. Shape matches `lib/push.ts:99` and B4's `bell_cron` precedent.
- `app/context/AppDataContext.tsx:98,134,165` bare catches replaced with `Sentry.captureException(err)` + `console.warn` with stable tag (`[appdata:bell]`, `[appdata:shifts:${scope}]`, `[appdata:village]`). Existing polling architecture preserved.
- New `tests/notify-outcomes.test.ts` covers the L13 + L16 server-side contract: empty-inner-circle → returns `{ kind: 'no_recipients', reason: 'empty_inner_circle' }` AND emits the structured skip log; vapid-missing → returns `{ kind: 'vapid_missing' }` (or whatever `PushResult.reason === 'vapid_not_configured'` maps to per Pressure-test §1) AND emits a corresponding skip log; partial delivery (some delivered, some failed) → returns `{ kind: 'partial', delivered, failed }`; full delivery → returns `{ kind: 'delivered', count }`. Spies on the structured log call site, not on the route's 200 status (per the 2026-05-02 "spy on the gate" lesson).
- New `tests/notify-skip-logs.test.ts` covers the remaining L16 early-return paths in functions that return `void`: `notifyShiftClaimed` creator opted out; `notifyShiftReleased` creator opted out; `notifyShiftCancelled` recipient opted out; `notifyBellEscalated` empty field; `notifyBellResponse` no parents opted in; `send()` Resend missing OR empty `to` list. Each test asserts the structured log fires with the expected `event` and `reason`.
- New `tests/appdata-context-error-visibility.test.ts` covers L29: render `AppDataProvider`, mock `Sentry.captureException`, mock `fetch` to reject, assert Sentry sees the error with the stable tag. One case per polling endpoint (bell, shifts, village).
- `npm run test` passes the three new files plus the full existing suite. `npm run lint` clean.
- `grep -n "{ sent: " lib/notify.ts app/api/bell/route.ts app/api/shifts/route.ts` returns no occurrences of the synthesized `{ sent: count, eligible: count }` shape (the falsifiable assertion that the L13 root cause is removed).
- `grep -n "catch {" app/context/AppDataContext.tsx` returns no occurrences (the falsifiable assertion that the L29 root cause is removed). Bare `catch` in other files is out of scope (`app/components/ScreenSettings.tsx:97` `catch { /* ignore */ }` on a notification-prefs GET, etc. — those are not Theme E).

**Out of scope:**
- L17 (push pruning of permanent 4xx) and L18 (push_subscriptions uniqueness) — Theme G. If a fix attempt starts touching `lib/push.ts` subscription-cleanup or unique-index logic, scope-creep interrupt fires.
- L19 (notification-click deep link) — Theme G.
- L25 (family-invite rate limit), L26 (feedback rate limit) — Theme I.
- L27 (upload privacy) — Theme J.
- Refactoring `PushRegistrar` beyond what L13's UI half needs. The four-state `permState` machine adds states; it does not lift the registrar component to a context or split it.
- Migrating non-Theme-E bare `catch` blocks elsewhere in the codebase. `app/components/ScreenPost.tsx:45` (`}).catch(() => {})` on a service-worker post-install ping) and `app/components/HomesteadApp.tsx:236` are flagged for future work, not B5.
- Sentry SDK install/upgrade. `sentry.client.config.ts` already exists per synthesis L28 evidence; this batch imports `@sentry/nextjs` (or whatever the existing surface is) and uses `captureException`. If the install is broken (DSN unset per L28), the captureException calls degrade to no-ops harmlessly — that's L28's job to fix, not B5's.
- L8 (typed `unauthorized()` / `forbidden()` / `rateLimited()` helpers in `lib/api-error.ts`). The `/api/bell` and `/api/shifts` POST routes currently funnel errors through `authError()` — B5 doesn't migrate that. The new `notify` outcome on the success response is the only contract change.

## Conventions

Pattern scan of B5 surface (`lib/notify.ts`, `lib/push.ts`, `app/api/bell/route.ts`, `app/api/shifts/route.ts`, `app/components/ScreenLantern.tsx`, `app/components/ScreenPost.tsx`, `app/components/ScreenSettings.tsx`, `app/components/PushRegistrar.tsx`, `app/context/AppDataContext.tsx`, `tests/notify-isolation.test.ts`, `tests/notify-resend-error-logging.test.ts`, `tests/bell-cron.test.ts`):

- **Structured log shape is established.** `lib/push.ts:99-108` is canonical: `console.log(JSON.stringify({ event: '<name>', context: '<context>', ...counters }))`. B4's `bell_cron` follows it. B5 uses `event: 'notify_<fn>_skip'` (e.g., `notify_bell_ring_skip`, `notify_shift_claimed_skip`, `notify_email_skip`) with a `reason` field. **Do not invent a new shape.** Do not log via `console.error` for skips — `console.log` is the success/info channel here, `console.error` stays reserved for actual failures (preserve the existing `[notify:*:push]` `console.error` lines on push exceptions).
- **`notify.ts` already has a clean try/catch around every `pushTo*` call.** Pattern (e.g., `:74-86`): `try { await pushToUser(...); pushSent = 1; } catch (err) { console.error('[notify:newShift:push:targeted]', err); }`. The L13 fix changes what's *captured* from the push call (the `PushResult`, not just the call's success/failure), not the try/catch shape itself. Keep the `console.error` lines intact for unexpected exceptions; the new structured log is for outcome reporting on the happy and silent-skip paths.
- **`PushResult` is already richly typed** at `lib/push.ts:37-44`: `{ attempted, delivered, stale, failed, errors, reason? }`. Note `reason` is already `'vapid_not_configured'` (only) on the VAPID-missing path. B5 uses this directly for the new `NotifyResult` discriminator (see Pressure-test §1). **Do not re-derive `PushResult` shape; consume it.**
- **Existing `notify.ts` early-return discipline is inconsistent.** Some functions return `void` (`notifyShiftClaimed`, `notifyShiftReleased`, `notifyShiftCancelled`, `notifyBellEscalated`, `notifyBellResponse`). Two return `{ sent, eligible }` (`notifyNewShift`, `notifyBellRing`). B5 changes those two to return the new `NotifyResult`. The `void`-returning functions stay `void`; only their early-return paths get the structured log per L16. Why not unify everything to `NotifyResult`? Because the route handlers don't surface `notifyShiftClaimed`'s outcome to the client — the shift was claimed regardless of whether the parent's push went out, and there's no UI consumer for "claim notification skipped." Synthesis L13 is specifically about caller-visible counts on the bell/shift POST. The other notify functions are operationally observable via logs only; that's what L16 fixes.
- **Test mock patterns** (`tests/notify-isolation.test.ts`, `tests/notify-resend-error-logging.test.ts`): `vi.mock('@/lib/db', () => ({ db: { select: vi.fn() } }))`, `vi.mock('@/lib/push', () => ({ pushToUser: vi.fn(), pushToUsers: vi.fn() }))`. Spy on `console.log` via `vi.spyOn(console, 'log').mockImplementation(() => {})` then assert the JSON-parsed call args contain the expected `event` and `reason`. **Important:** the existing `notify-resend-error-logging.test.ts` is the closest precedent for "assert on a structured log line" in this codebase — read it before writing the new test files.
- **AppDataContext Sentry import:** existing `sentry.client.config.ts` exists per synthesis L28. The standard Next.js Sentry SDK pattern is `import * as Sentry from '@sentry/nextjs'`. **Verify the import path before committing** — if the project uses a custom wrapper or a different Sentry SDK version (Sentry SDK v10 per `launch-readiness-5k.md` line 81), the import path may differ. Reading `sentry.client.config.ts` confirms the surface.
- **Auth/error contract on `/api/bell` and `/api/shifts` POST stays untouched.** `authError(err, ...)` is the canonical catch path; the success response gets a new `notify` key but the error path is identical. L8's typed helpers are not B5's job.
- **No new dependencies.** `Sentry` is presumed already installed (L28 / `sentry.client.config.ts`). No `p-limit`, no new logging library, no schema changes, no migrations.

## File map

- **`lib/notify.ts` — edit (~150-line restructure).** The diff:
  1. Define `NotifyResult` discriminated union at the top of the file (after imports, before the `RESEND_API_KEY` check):
     ```ts
     export type NotifyResult =
       | { kind: 'delivered'; recipients: number; delivered: number }
       | { kind: 'partial'; recipients: number; delivered: number; failed: number; errors: string[] }
       | { kind: 'no_recipients'; reason: 'empty_inner_circle' | 'empty_field' | 'no_caregivers' | 'targeted_caregiver_not_opted_in' }
       | { kind: 'vapid_missing'; recipients: number }
       | { kind: 'push_error'; recipients: number; error: string };
     ```
     Justified in Pressure-test §1.
  2. Define a tiny `logSkip(event, payload)` helper at the top of the file that wraps the `console.log(JSON.stringify({ event, ...payload }))` call. Used by every L16 skip path. ~5 lines, file-local. Justified in Pressure-test §2.
  3. `send()` (line 15): the `if (!RESEND_API_KEY || to.length === 0) return;` early return becomes two structured logs:
     - `if (!RESEND_API_KEY) { logSkip('notify_email_skip', { reason: 'resend_not_configured' }); return; }`
     - `if (to.length === 0) { logSkip('notify_email_skip', { reason: 'empty_recipient_list' }); return; }`
  4. `notifyNewShift()` (line 38): change return type to `NotifyResult`. The `if (!row?.shift || !row.household) return { sent: 0, eligible: 0 };` becomes `logSkip('notify_new_shift_skip', { reason: 'shift_or_household_missing', shiftId }); return { kind: 'no_recipients', reason: 'no_caregivers' };` (the user-facing warning shouldn't surface as `vapid_missing` since the issue is data, not infra; mapping to `no_recipients` keeps the client copy honest — see Pressure-test §3 for why `no_recipients` is the right bucket here vs a new `kind: 'data_missing'`). The targeted-caregiver-not-opted-in branch returns `{ kind: 'no_recipients', reason: 'targeted_caregiver_not_opted_in' }`. The push-success branch returns `{ kind: 'delivered' | 'partial' | 'vapid_missing' | 'push_error', ... }` derived from the captured `PushResult` via a small `pushResultToNotify(result, recipients)` helper (also file-local, ~10 lines).
  5. `notifyShiftClaimed()` (line 119): `if (!row?.shift || !row.shift.claimedByUserId) return;` → add `logSkip('notify_shift_claimed_skip', { reason: 'shift_or_claim_missing', shiftId })` before return. `if (!creator) return;` → add `logSkip('notify_shift_claimed_skip', { reason: 'creator_missing', shiftId })`. `if (creator.notifyShiftClaimed === false) return;` → add `logSkip('notify_shift_claimed_skip', { reason: 'creator_opted_out', shiftId, creatorId: creator.id })`. Function still returns `void`.
  6. `notifyShiftReleased()` (line 167): same shape — three skip logs with `reason: 'shift_missing' | 'creator_missing' | 'creator_opted_out'`.
  7. `notifyShiftCancelled()` (line 201): three skip logs with `reason: 'shift_missing' | 'recipient_missing' | 'recipient_opted_out'`.
  8. `notifyBellRing()` (line 249): change return type to `NotifyResult`. Each `return { sent: 0, eligible: 0 }` becomes a discriminated return + `logSkip`:
     - bell-missing → `{ kind: 'no_recipients', reason: 'no_caregivers' }` + `logSkip('notify_bell_ring_skip', { reason: 'bell_missing', bellId })`
     - household-missing → same shape + `reason: 'household_missing'`
     - empty inner circle → `{ kind: 'no_recipients', reason: 'empty_inner_circle' }` + `logSkip('notify_bell_ring_skip', { reason: 'empty_inner_circle', bellId, householdId })`
     - push success → derived from `PushResult` via `pushResultToNotify(result, innerCircle.length)`
     - push exception (catch block) → `{ kind: 'push_error', recipients: innerCircle.length, error: <message> }` + existing `console.error` line preserved
  9. `notifyBellEscalated()` (line 281): `if (!bell) return;` → `logSkip('notify_bell_escalated_skip', { reason: 'bell_missing', bellId }); return;`. `if (sitters.length === 0) return;` → `logSkip('notify_bell_escalated_skip', { reason: 'empty_field', bellId, householdId }); return;`. Still returns `void`.
  10. `notifyBellResponse()` (line 308): three skip logs with `reason: 'bell_missing' | 'responder_missing' | 'no_parents_opted_in'`.

  Why a small `pushResultToNotify` helper instead of inline logic in each push-branch: three call sites (`notifyNewShift` targeted, `notifyNewShift` broadcast, `notifyBellRing`) need the same `PushResult → NotifyResult` mapping. Three is the inflection point per CLAUDE.md ("Three similar lines is better than a premature abstraction" — implying three+ identical *blocks* warrants extraction). Mapping rules:
  ```ts
  function pushResultToNotify(r: PushResult, recipients: number): NotifyResult {
    if (r.reason === 'vapid_not_configured') return { kind: 'vapid_missing', recipients };
    if (r.delivered === r.attempted && r.failed === 0) return { kind: 'delivered', recipients, delivered: r.delivered };
    if (r.delivered > 0) return { kind: 'partial', recipients, delivered: r.delivered, failed: r.failed, errors: r.errors.slice(0, 3) };
    return { kind: 'push_error', recipients, error: r.errors[0] || 'all_subscriptions_failed' };
  }
  ```
  The "stale" count (subscriptions cleaned up due to 410) doesn't surface to the client — it's an internal cleanup signal already logged by `lib/push.ts:99-108`. From the client's POV, a stale-only result is a `push_error` (no one got it) — the operational fix is to re-prompt the user to re-subscribe, which L13's UI half handles separately.

- **`app/api/bell/route.ts` — edit (~6-line change at lines 45-53).** Replace `let notifySent = 0; let notifyEligible = 0; try { ({ sent: notifySent, eligible: notifyEligible } = await notifyBellRing(bell.id)); } catch (err) { console.error('[bell:ring:notify]', err); } return NextResponse.json({ bell, notifySent, notifyEligible });` with:
  ```ts
  let notify: NotifyResult = { kind: 'push_error', recipients: 0, error: 'notify_threw' };
  try {
    notify = await notifyBellRing(bell.id);
  } catch (err) {
    console.error('[bell:ring:notify]', err);
  }
  return NextResponse.json({ bell, notify });
  ```
  Import `NotifyResult` from `@/lib/notify`. The catch-block default `kind: 'push_error'` is the safe fallback when `notifyBellRing` itself throws (vs. returns a `push_error` outcome) — the route still returns 200 with the bell created, and the client renders the same "push delivery failed" warning.

- **`app/api/shifts/route.ts` — edit (~6-line change at lines 267-277).** Same shape as the bell route. Replace the synthesized `{ shift, count, notifySent, notifyEligible }` with `{ shift, count, notify }`. Default `notify` to `{ kind: 'push_error', recipients: 0, error: 'notify_threw' }` when the catch fires.

- **`app/components/ScreenLantern.tsx` — edit (~10-line change at lines 217-224).** Replace the `notifyEligible === 0 ? ... : notifySent === 0 ? ... : null` heuristic with a `kind`-discriminated switch:
  ```ts
  const warning = (() => {
    const n = data.notify;
    if (!n) return null;
    if (n.kind === 'no_recipients') return `${getCopy().urgentSignal.noun} lit — but no caregivers have notifications enabled. They'll see it when they open the app.`;
    if (n.kind === 'vapid_missing' || n.kind === 'push_error') return `${getCopy().urgentSignal.noun} lit — push delivery failed. Caregivers will see it when they open the app.`;
    if (n.kind === 'partial') return `${getCopy().urgentSignal.noun} lit — some caregivers may not have received the push. They'll see it when they open the app.`;
    return null;
  })();
  ```
  User-visible copy preserved verbatim for the two existing branches; new `partial` case gets its own copy.

- **`app/components/ScreenPost.tsx` — edit (~10-line change at lines 144-152).** Same `kind`-discriminated treatment; new `partial` branch added.

- **`app/components/PushRegistrar.tsx` — no change.** `requestPushPermission()` already returns the discriminated result. The L13 client-side fix is entirely in `ScreenSettings.tsx`'s consumption of that return value.

- **`app/components/ScreenSettings.tsx` — edit (~30-line change at lines 63-73, 234-281).** Extend the `PermState` union from `'unsupported' | 'default' | 'granted' | 'denied' | 'requesting'` to include `'granted_unregistered'` and `'failed'`. The `granted_unregistered` state means the browser permission is granted but `/api/push/subscribe` failed. `handleEnableNotifications` becomes:
  ```ts
  async function handleEnableNotifications() {
    setPermState('requesting');
    const result = await requestPushPermission();
    if (result.ok) {
      setPermState('granted');
    } else if (result.reason.startsWith('subscribe_api_') || result.reason === 'vapid_key_missing') {
      setPermState('granted_unregistered');
    } else {
      // permission_denied / permission_default / push_not_supported — read browser state
      setPermState(Notification.permission as PermState);
    }
  }
  ```
  Display row (lines 236-281) gains a branch for `granted_unregistered` rendering "Push allowed by your browser, but registration failed. Try again." with a retry button. The `granted` row is unchanged. Note: the registrar effect at `PushRegistrar.tsx:14-60` runs independently on mount — if `/api/push/subscribe` fails there too, the user sees `permState = 'granted'` from `Notification.permission` until they visit Settings. This is a known asymmetry, called out in Fragile area §1 — fully fixing it would require a context for registration state shared between the registrar and Settings, which is out of scope.

- **`app/context/AppDataContext.tsx` — edit (~9-line change across lines 98-100, 134-136, 165-167).** Add `import * as Sentry from '@sentry/nextjs';` to the imports (verify via Read of `sentry.client.config.ts`). Replace each of the three bare `catch {}` blocks with:
  ```ts
  } catch (err) {
    Sentry.captureException(err, { tags: { source: 'appdata:bell' } }); // or :shifts:${scope} / :village
    console.warn('[appdata:bell] fetch failed', err instanceof Error ? err.message : String(err));
  }
  ```
  The existing comments (`// silent — polling; next tick will retry`) are removed — they're no longer accurate.

- **`tests/notify-outcomes.test.ts` — new file (~180 lines).** Five describe blocks covering the L13 + L16 contract on `notifyBellRing` and `notifyNewShift`:
  1. **`notifyBellRing` empty inner circle** — mock `db.select` chain to return `[]` for the inner-circle query; assert returned `{ kind: 'no_recipients', reason: 'empty_inner_circle' }`; assert `console.log` called with parsed JSON containing `event: 'notify_bell_ring_skip'` and `reason: 'empty_inner_circle'`.
  2. **`notifyBellRing` vapid missing** — mock `pushToUsers` to resolve with `{ attempted: 3, delivered: 0, stale: 0, failed: 3, errors: [], reason: 'vapid_not_configured' }`; assert returned `{ kind: 'vapid_missing', recipients: 3 }`.
  3. **`notifyBellRing` partial delivery** — mock `pushToUsers` to resolve with `{ attempted: 3, delivered: 2, stale: 0, failed: 1, errors: ['HTTP 500'] }`; assert returned `{ kind: 'partial', recipients: 3, delivered: 2, failed: 1, errors: ['HTTP 500'] }`.
  4. **`notifyBellRing` full delivery** — mock `pushToUsers` to resolve with `{ attempted: 3, delivered: 3, ... }`; assert returned `{ kind: 'delivered', recipients: 3, delivered: 3 }`.
  5. **`notifyNewShift` targeted-caregiver-not-opted-in** — mock recipients with `notifyShiftPosted: false` for the targeted caregiver; assert returned `{ kind: 'no_recipients', reason: 'targeted_caregiver_not_opted_in' }`.

  Each test follows the `tests/notify-resend-error-logging.test.ts` precedent for spying on `console.log` and parsing the JSON arg. Spy setup goes in `beforeEach`.

- **`tests/notify-skip-logs.test.ts` — new file (~120 lines).** Six describe blocks, one per L16 path in the void-returning functions:
  1. `notifyShiftClaimed` creator opted out → logs `notify_shift_claimed_skip` with `reason: 'creator_opted_out'`.
  2. `notifyShiftReleased` creator opted out → logs `notify_shift_released_skip` with `reason: 'creator_opted_out'`.
  3. `notifyShiftCancelled` recipient opted out → logs `notify_shift_cancelled_skip` with `reason: 'recipient_opted_out'`.
  4. `notifyBellEscalated` empty field → logs `notify_bell_escalated_skip` with `reason: 'empty_field'`.
  5. `notifyBellResponse` no parents opted in → logs `notify_bell_response_skip` with `reason: 'no_parents_opted_in'`.
  6. `send()` empty recipient list → logs `notify_email_skip` with `reason: 'empty_recipient_list'`. Tested via `notifyShiftClaimed` with a creator that has `email: null` (the path that lands at `if (!creator.email) return` after the push branch — this also wants its own skip log per L16, see decision in Pressure-test §3).

  Each test asserts the function returns (no throw) AND the log fires with the expected event+reason.

- **`tests/appdata-context-error-visibility.test.ts` — new file (~80 lines).** Three describe blocks, one per polling endpoint:
  1. **Bell polling fetch rejects** — render `AppDataProvider`, mock `Sentry.captureException`, mock `global.fetch` to reject with `new Error('network')` for the bell endpoint, wait for the initial fetch, assert `Sentry.captureException` called once with the error AND a `tags: { source: 'appdata:bell' }` matcher.
  2. **Shifts polling fetch rejects** — same shape; trigger via `refreshShifts('all')` from a test consumer; assert tag `source: 'appdata:shifts:all'`.
  3. **Village polling fetch rejects** — same shape; assert tag `source: 'appdata:village'`.

  React Testing Library is the existing test surface for components (verify via `tests/lantern-caregiver-visibility.test.ts` or `tests/member-card-layout.test.ts`). Sentry mock: `vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))`.

## Graveyard

(empty — entries dated when added)

## Anchors

- `lib/push.ts` `PushResult` shape (lines 37-44) is the source of truth for what comes back from `pushTo*` calls. B5 consumes it; **does not** modify it.
- `lib/push.ts:99-108` structured `push_batch` log is the canonical observability shape. B5's `notify_*_skip` logs use the same shape (`event` + context fields).
- Spec NN #4: "No fire-and-forget notifications. Every send is awaited; failures are logged. No `.catch(() => {})`." After B5: every early-return in `lib/notify.ts` emits a structured log; every pushed-out result is captured and surfaced (server) or sent to Sentry (client). The constitutional letter and spirit are both satisfied for the first time.
- `launch-readiness-5k.md` line 51: "Bell silent-no-op visibility — recipient count surfaced to caller. Empty inner circle, missing push subs, missing VAPID — caller sees the why, not a 200 with nothing happening." After B5: the lantern POST response carries `notify: { kind: 'no_recipients' | 'vapid_missing' | 'push_error' | 'partial' | 'delivered', ... }`, and ScreenLantern renders a discriminated warning. The bar is met.
- `app/api/bell/route.ts:48` (where `notifyBellRing` is awaited) — the synchronous-await pattern is correct and stays. B5 changes only the captured shape, not the awaited-vs-fired property.
- `app/components/PushRegistrar.tsx:65-105` `requestPushPermission()` already returns the discriminated `PushPermissionResult`. B5 leans on this — does not modify the function. Its callers' consumption is the surface that changes.
- After B5: the only `.catch(() => {})` patterns left in `app/` and `lib/` are `app/components/ScreenPost.tsx:45` (service-worker post-install ping) and `app/components/HomesteadApp.tsx:236` (also an SW post-install side-effect — confirmed via Bash grep in pattern scan). Both are out of scope for B5; future work.

## Fragile areas

1. **`PushRegistrar` and `ScreenSettings` are independent surfaces of the same registration state.** The `useEffect` in `PushRegistrar.tsx:17-60` calls `/api/push/subscribe` on mount when `Notification.permission === 'granted'`. The `handleEnableNotifications` in `ScreenSettings.tsx:69-73` also calls `requestPushPermission()` (which subscribes). If the registrar's mount-time subscribe succeeds but the user later visits Settings, `permState` reads from `Notification.permission` (still `'granted'`), and the new four-state machine has no signal that registration actually succeeded. **Mitigation in B5:** the `granted_unregistered` state is only entered via `handleEnableNotifications`'s explicit return value. The registrar's mount-time subscribe failure is logged (already at `PushRegistrar.tsx:55`) but does not propagate to Settings. **Full fix would require a registration-state context** shared between registrar and Settings — out of scope per scope-creep boundary. Document the gap; do not paper it over.
2. **`Sentry.captureException` is presumed safe.** Per synthesis L28, `SENTRY_DSN` is missing from `.env.example` and may be unset in some environments. When DSN is unset, `@sentry/nextjs`'s `captureException` is a no-op — calling it does no harm. **Verify this by reading `sentry.client.config.ts` before committing.** If the existing config uses a custom wrapper that throws on missing DSN (unlikely but possible), B5 wraps the call in its own try/catch. Otherwise, the bare call is fine.
3. **`/api/shifts` POST has multiple recurrence-generated rows.** Looking at `app/api/shifts/route.ts:265-275`, only the first created row's notify is fired (`if (created[0])`). For a recurrence that generates 12 weekly shifts, only the first triggers `notifyNewShift`. The `notify` outcome on the response describes only that first call's recipients/delivery. **B5 does not change this behavior** — it preserves the existing semantics (firing 12 separate notifications would spam caregivers; the spec's "shift posted" notification is intended once per recurrence series, not per occurrence). This is a pre-existing intent, not a B5 bug. Flagged so the new outcome shape isn't misread as "delivered to all 12 recurrence instances."
4. **Test mocking of `console.log` is global.** The `vi.spyOn(console, 'log').mockImplementation(() => {})` pattern silences all log output during the test. Other notify functions in the same module that `console.log` for non-skip reasons (none currently — `lib/push.ts:100` is the only existing structured log call site, and it's in `push.ts` not `notify.ts`) would have their output captured. **Mitigation:** assert via `vi.mocked(console.log).mock.calls.find(call => parseJson(call[0])?.event === '<expected>')` rather than `toHaveBeenCalledWith` — find by event name, not by exact argument match. This makes tests resilient to other log additions.
5. **`NotifyResult` type lives in `lib/notify.ts`** and is imported by route handlers and (transitively, via the JSON response) consumed by client components. The client side has no compile-time guarantee that the shape matches — JSON crosses the runtime boundary. **Mitigation:** the test for `/api/bell` POST (existing or new) should assert on the response body shape; the discriminated `kind` field's string values are the contract. If a future refactor renames `kind: 'vapid_missing'` to `kind: 'push_disabled'`, both server and client tests fail loudly. The client component does a `kind` check via a sequence of `if`s — TypeScript narrows the union only inside `lib/notify.ts`'s server-side scope. Not a B5-introduced fragility, but a B5-amplified one.
6. **B4 lesson "regression tests must spy on the actual gate" applies directly.** For L13 tests: the regression class is "the synthesized `{ sent: count, eligible: count }` returns even when no push went out." Mentally revert the fix → restore the synthesized return → the test must fail because the assertion is on `kind: 'no_recipients' | 'vapid_missing'`, which the reverted code doesn't return. For L16 tests: the regression class is "early returns are silent." Mentally revert → remove the `logSkip` call → the test must fail because the `console.log` spy never sees the expected `event`. Verify both by actually reverting at green-test-write time and confirming red. Three-line cost; closes the vacuous-pass failure mode.

## Pressure-tested decisions (Protos §"Plan-reviewer" requirements)

### §1 — Server-side surface shape: rich PushResult passthrough vs discriminated NotifyResult

The user's prompt named two options:
- **Option A:** rich PushResult-shaped object `{ eligibleUsers, attemptedSubscriptions, delivered, stale, failed, reason }`. Pros: zero abstraction over the existing `PushResult` type. Cons: the client has to know `PushResult`'s reason values and derive its own discrimination logic.
- **Option B:** discriminated outcome `{ kind: 'delivered', count } | { kind: 'no_recipients', reason: ... } | { kind: 'vapid_missing' } | { kind: 'partial', delivered, failed }`.

User's default position: Option A.

**Decision: Option B.** Refuting the default. Three reasons:

1. **The client *does* need to discriminate.** Both `ScreenLantern` and `ScreenPost` need to render different copy for "no recipients," "VAPID missing," "partial delivery," and "all failed." Option A forces the client to write the discrimination logic from raw `PushResult` fields (`if (!result.attempted) ... else if (result.reason === 'vapid_not_configured') ... else if (result.failed === result.attempted) ... else if (result.delivered < result.attempted) ...`). Option B does the discrimination once, server-side, where the type system can enforce exhaustiveness on `kind`.
2. **`PushResult` doesn't capture "no recipients found" cleanly.** When `notifyBellRing` finds zero `inner_circle` users, it returns `{ sent: 0, eligible: 0 }` today *without ever calling `pushToUsers`*. There's no `PushResult` to forward — it would have to be synthesized. Option A's "passthrough" framing is a bit misleading: the server has to invent the response on at least the empty-recipients path. Once you're inventing a shape for one case, designing it as a discriminated union for all cases is the same effort.
3. **Future evolution.** If L17 (push pruning) adds a `permanent_failure` reason, or L18 (subscription dedupe) introduces a `duplicate_subscription` skip, those map cleanly to new `kind` values. Adding to a discriminated union is one place; adding to an Option-A passthrough means every client consumer has to learn the new field.

The cost: a small mapping function (`pushResultToNotify`) sits between `PushResult` and `NotifyResult`. ~10 lines, file-local, easily testable. Not abstraction — it's the discriminator layer that Option B requires.

### §2 — Where the structured log fires for L16: inline at each early-return, or centralized wrapper

User's default position: inline at each early-return. **Default holds.**

Argument for inline:
- Each return has different context. `notifyBellRing`'s empty-inner-circle log wants `{ bellId, householdId }`; `notifyShiftClaimed`'s creator-opted-out log wants `{ shiftId, creatorId }`. A wrapper would either need a generic `Record<string, unknown>` payload (loses type safety) or a per-event schema (becomes more code than inline calls).
- The `logSkip(event, payload)` helper in this plan is *not* a wrapper around the function — it's a one-line wrapper around `console.log(JSON.stringify({ event, ...payload }))`. It saves the `JSON.stringify` repetition without taking on the framing responsibility. Inline calls + tiny helper is the right level of abstraction.

Argument against (and why it's wrong):
- "A wrapper that takes `(event, context, fn)` and logs entry/exit would be cleaner." → No: the early-return paths are *not* the same as entry/exit. They fire mid-function based on data. Wrapping each `notify*` function in a higher-order log would add entry/exit logs for every call (noise) and still not capture the skip-with-reason payload. It's more work and worse output.

### §3 — Log shape consistency with `lib/push.ts:99` and `bell_cron`

User's default position: event prefix `notify_*` (e.g., `notify_bell_ring_skip`, `notify_shift_claimed_skip`, `notify_email_skip`) with a `reason` field. **Default holds.**

Justification: `lib/push.ts:99-108` uses `event: 'push_batch'` (verb-noun). B4's cron uses `event: 'bell_cron'` (noun-noun). Both are short, JSON-grep-friendly, and don't clash with route names. `notify_<fn>_skip` extends the pattern — `<fn>` distinguishes which notify function fired; `_skip` distinguishes intentional/no-op exits from actual delivery (which doesn't need its own log; `push_batch` is already the delivery log). The `reason` field carries the discriminator (`empty_inner_circle`, `creator_opted_out`, etc.).

One refinement to the default: `send()` (the email helper) gets `event: 'notify_email_skip'`, not `notify_send_skip` — `send` is too generic a function name for an event identifier. The reader wants to know "what got skipped"; "an email" is the meaningful answer.

Edge case from File map §10 — `notifyShiftClaimed` has a path at `:152` (`if (!creator.email) return`) that is *not* in L16's enumerated list (which stops at line 135 for that function). The path is structurally identical to L16's other "intentional suppression" returns and would be silent today. **B5 covers it** — the cost is one log line, the benefit is consistency. Pressure-tested: the alternative is "L16 says only what L16 says," but that produces a half-fixed file where some skip paths log and some don't, which violates the spec NN #4 spirit ("failures are logged"). Cover all of them.

### §4 — Client UI surface for L13: four-state machine vs server-confirmed-only

User's default position: Option A — track separate registration state (`'idle' | 'requesting' | 'granted_unsubscribed' | 'subscribed' | 'failed'`) and render only when both browser permission AND server registration succeed.

**Decision: Option A, but reduced to the two new states this batch actually needs.** Refuting the default in detail.

The full five-state machine the user proposed conflates two concerns:
- **Permission state** (browser-owned, the source of truth for whether push *can* fire): `'unsupported' | 'default' | 'granted' | 'denied'` — these are exactly `Notification.permission`'s values, plus `'unsupported'` for older browsers.
- **Registration state** (server-owned, the source of truth for whether the subscription is on file): `'unregistered' | 'registering' | 'registered' | 'failed'`.

The current code uses a single `PermState` that mixes these (`'unsupported' | 'default' | 'granted' | 'denied' | 'requesting'`). A clean split would have two independent state variables. But that's a larger refactor than B5 needs.

**B5's minimum viable change:** add two states to the existing `PermState`: `'granted_unregistered'` (browser granted, server registration failed) and `'failed'` (request failed for an unrelated reason). The display logic gains one new branch: if `permState === 'granted_unregistered'`, render "Push allowed by your browser, but registration failed. Try again." with a retry button. Everything else is unchanged.

Why not the full split:
- Two state variables means the display has to render a 4×4 matrix of combinations. Most cells are unreachable (`permission: 'denied' + registration: 'registered'` is impossible), but the type system doesn't know that — every combination has to be defended against.
- The single union with an additional discriminant value preserves the existing mental model (one state, one display branch per value) and lets the regression test surface (UI render tests for ScreenSettings) extend additively.
- The full registration-state context (Fragile area §1) is the right "do it properly" answer. B5's two-state addition gets the operational signal in front of the user without committing to the larger refactor.

### §5 — `AppDataContext.tsx` error handling: per-catch Sentry call vs helper vs SWR migration

User's default position: Option A — `Sentry.captureException(err)` + `console.warn` with stable tag in each of the three bare catches. **Default holds.**

Refutation of the alternatives:
- Option B (helper that wraps the fetch): the three fetch sites have different result-handling logic (bell parses + sets two state variables; shifts updates a keyed dict; village reads `data.adults`). A wrapper that normalizes "fetch + parse JSON + handle status codes + handle errors" would either pass back a generic `{ ok, data, err }` (offloading the error decision back to the call site, defeating the helper) or take a per-call `onSuccess` callback (becoming a code-shaped wrapper). Three call sites is below the inflection point for extraction.
- Option C (React Query / SWR migration): introduces a new dependency, changes the polling architecture, and is a multi-hundred-line refactor with its own test surface. This is the kind of scope expansion the scope-creep interrupt is meant to catch. Synthesis L29 explicitly names Option A; B5 follows.

### §6 — Test strategy

L13 tests live in `tests/notify-outcomes.test.ts`; L16 tests in `tests/notify-skip-logs.test.ts`; L29 tests in `tests/appdata-context-error-visibility.test.ts`. Three new files; no existing test extension.

**Per the 2026-05-02 "spy on the gate" lesson:**
- L13 tests assert on the returned `kind` value (the gate is "what shape does the function return"), not just on `console.log` being called. A regression that strips the discrimination logic and falls back to `{ sent, eligible }` would fail the type check at the test boundary AND the runtime assertion.
- L16 tests assert on the `console.log` spy's parsed JSON containing the expected `event` and `reason` (the gate is "did the structured log fire with the right discriminator"), not just on the function returning early. A regression that drops the `logSkip` call but keeps the early `return` would fail the log-spy assertion.
- L29 tests assert on `Sentry.captureException` being called with the rejected error AND the right `source` tag (the gate is "did Sentry see the error with proper context"). A regression that calls `captureException(err)` but drops the `tags` argument would fail the tag assertion.

**Falsifiability check before declaring tests done:** for each new test, mentally (or actually) revert the fix it claims to cover and re-run. Test must go red. Three new test files × ~12 cases × ~30 seconds per revert-rerun = ~6 minutes. Worth it; this is what closes the "vacuous pass" hole that B4 hit before the Stage 1 review caught it.

**Anti-pattern to avoid:** asserting on the route's 200 status or the response body's old `notifySent`/`notifyEligible` fields. The new contract is `notify: NotifyResult`. Any test that asserts on the old shape is testing a contract that no longer exists.

### §7 — Scope boundary with L17, L18, L19, L25, L26, L27

Hard boundary. If a fix attempt starts wanting to:
- Touch `lib/push.ts` to change subscription pruning (L17), uniqueness (L18) → STOP, surface, do not include. Theme G.
- Touch `app/api/sw-script/route.ts` for deep-link navigation (L19) → STOP, Theme G.
- Add rate limits to `/api/village/invite-family` (L25) or `/api/feedback` (L26) → STOP, Theme I.
- Touch `app/api/upload/route.ts` (L27) → STOP, Theme J.
- Migrate any auth/error route to typed `unauthorized()` / `forbidden()` helpers (L8) → STOP, separate batch.

The B5 surface is exactly: `lib/notify.ts`, `app/api/bell/route.ts` POST, `app/api/shifts/route.ts` POST (only the `notify*` capture lines), `app/components/ScreenLantern.tsx` (only the warning derivation), `app/components/ScreenPost.tsx` (only the warning derivation), `app/components/ScreenSettings.tsx` (only `permState` machine + display row), `app/context/AppDataContext.tsx` (only the three bare catches). Plus three new test files. **8 production files, 3 test files.** Anything more is scope creep.

### §8 — Backwards compatibility for `/api/bell` and `/api/shifts` response shapes

User's default position: Option B — cut over in one PR; same PR updates `ScreenLantern` and `ScreenPost` to consume the new shape. **Default holds.**

Justification: client and server are in the same monorepo, deployed atomically by Vercel. No third-party consumers. A shim layer (`{ notify, notifySent, notifyEligible }`) would be permanent debt — no one is going to come back and remove it. The deploy-cutover risk is zero (single deploy unit). YAGNI.

One caveat: if a service worker or a stale cached page tries the OLD shape against the NEW server, it would silently get `data.notifyEligible === undefined` and the `?? 0`-default-anywhere pattern would treat it as "0 → no recipients enabled" warning. Reading the existing code: `data.notifyEligible === 0` is the trigger, and `undefined === 0` is `false`, so the warning would *not* fire — the user would see no warning instead of a wrong warning. Acceptable degradation. Service workers don't cache POST responses.

### §9 — Server-then-client ordering inside the batch

Synthesis line 335: "L13 + L29 (observability) + L16 (logging) — coordinated, server-then-client." User's default sequencing: server contract first → route surfaces new shape → tests → client UI half + AppDataContext catches. **Default holds.**

The diff doesn't actually need to be reviewed in order — Vitest doesn't care about ordering, the deploy is atomic, and the PR review reads top-to-bottom however the reviewer prefers. But as a Build sequence:
1. `lib/notify.ts` — define `NotifyResult`, refactor `notifyBellRing` and `notifyNewShift` to return it, add `logSkip` calls to all L16 paths.
2. `app/api/bell/route.ts` and `app/api/shifts/route.ts` — surface `notify` instead of `{ notifySent, notifyEligible }`.
3. Write `tests/notify-outcomes.test.ts` and `tests/notify-skip-logs.test.ts`. Run `npm test`. Iterate to green.
4. `app/components/ScreenLantern.tsx` and `app/components/ScreenPost.tsx` — consume new `notify` shape.
5. `app/components/ScreenSettings.tsx` — extend `PermState` machine.
6. `app/context/AppDataContext.tsx` — replace bare catches with Sentry + console.warn.
7. Write `tests/appdata-context-error-visibility.test.ts`. Run `npm test`. Iterate to green.
8. `npm run lint`. Fix.
9. PR.

This sequence keeps green-testable units small. Steps 1-3 are server-only and independently testable. Steps 4-7 are client-only and independently testable. If step 4 breaks something, the server tests stay green and the bisect surface is small.

## Regression tests required (Hard Rule #6)

- `tests/notify-outcomes.test.ts` — five describe blocks per File map. Each test asserts the returned `NotifyResult` shape AND the structured log (where applicable). Falsifiable proof: revert the L13 fix in `notifyBellRing` (restore the synthesized `{ sent: innerCircle.length, eligible: innerCircle.length }`) — every test in the file must go red.
- `tests/notify-skip-logs.test.ts` — six describe blocks per File map. Each test asserts the structured log fires with the expected `event` and `reason`. Falsifiable proof: revert the L16 fix in any one function (remove the `logSkip` call) — the corresponding test must go red.
- `tests/appdata-context-error-visibility.test.ts` — three describe blocks per File map. Each test asserts `Sentry.captureException` called with the rejected error and the expected `source` tag. Falsifiable proof: revert any one of the three catches in `AppDataContext.tsx` (restore bare `catch {}`) — the corresponding test must go red.

Verification gates before declaring B5 done:
- `grep -n "{ sent: " lib/notify.ts app/api/bell/route.ts app/api/shifts/route.ts` returns no matches (the L13 root cause shape is gone).
- `grep -n "} catch {" app/context/AppDataContext.tsx` returns no matches (the L29 root cause is gone).
- `grep -c "logSkip" lib/notify.ts` returns ≥ 11 (covers all the L16 paths enumerated in §3 plus the §3-edge-case `creator.email` path).
- `npm run test` — full suite passes; new files contribute ~14 new cases.
- `npm run lint` — clean.

## Stretch / non-blocking

- **Lift `PushRegistrar` and `ScreenSettings` registration state into a shared context.** Fragile area §1. Closes the asymmetry where the registrar's mount-time subscribe failure isn't visible in Settings. Worth a separate batch when push-related UI gets revisited (Theme G adjacency).
- **Add a `notify` field to the `/api/shifts` POST response when a recurrence generates multiple rows.** Fragile area §3. Currently only the first row's notify is captured. A future enhancement could return `notify: NotifyResult[]` (one per generated shift), but the spec intent is "one notification per recurrence series," so this is more about response-shape honesty than a behavioral fix. Defer.
- **Unify `notifyShiftClaimed` / `notifyShiftReleased` / `notifyShiftCancelled` returns to `NotifyResult`.** Today they return `void`. If a future feature needs to surface "the claim notification was skipped because creator opted out" to the UI (e.g., a settings toast on the claimer side), the return shape would need to change. Out of scope; flagged.
- **Migrate `app/components/ScreenPost.tsx:45` and `app/components/HomesteadApp.tsx:236` away from `.catch(() => {})` to `.catch(err => console.warn(...))`.** Both are service-worker post-install side-effects. Low-risk; not Theme E; defer to a "fragile area cleanup" batch.
- **Promote `event: 'notify_*_skip'` log shape into `lib/log.ts` or similar shared module** if a third caller emerges. For now, three structured-log call sites (`push.ts:99`, `cron/route.ts`'s `bell_cron`, and `notify.ts`'s `notify_*_skip`) is below the extraction inflection point. Each rolls its own one-liner.
