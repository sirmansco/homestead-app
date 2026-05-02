---
title: Launch fix batch 06 — Push subscription correctness + cost (uniqueness + permanent-failure pruning + deep-link click)
date: 2026-05-02
status: built — pending review
governs: L18 (primary, blocks-launch), L17 (paired, should-fix), L19 (paired, should-fix)
parent-audit: docs/plans/launch-audit-2026-05-02/synthesis.md
batch-id: B6
prereqs: B5 sha 3c4a3a9 merged (Theme E closed); B-snapshots sha b3fee55 merged (snapshot chain intact through 0007)
unblocks: none direct; clears synthesis Theme G. Theme H (DB indexing pass — L20/L21/L22/L15 index) remains independent and follows.
---

## Spec

This batch closes synthesis Theme G (line 337: "Push subscription correctness + cost: L18 (uniqueness) + L17 (pruning) + L19 (deep link)"). The theme makes two launch-bar lines operationally true for the first time and closes one spec-correctness gap on the deep-link contract:

- **`launch-readiness-5k.md` line 50** ("Push delivery — logged for every attempt. Every attempt must be observable in Vercel logs with success/failure status.") — pre-B6, the `push_batch` log already records `attempted/delivered/stale/failed`, but "stale" only counts `404|410`. Permanent-4xx subscriptions (typically `403` from expired auth) are bucketed into `failed` indistinguishably from retryable `429`/`5xx`. Operations cannot tell which failures should drain the row vs which to retry. After L17, the structured log carries a per-status disposition reason (`prune_404`, `prune_410`, `prune_403`, `prune_413`, `retry_429`, `retry_5xx`, `unknown`), and the prune set widens to documented permanent failures.
- **`launch-readiness-5k.md` performance bar** (5K saturation: 10 bells/min × 2-10 recipients × N duplicate subs). Pre-B6, `pushSubscriptions` has no `(user_id, endpoint)` uniqueness; the subscribe route is a select-then-insert race; `pushToUsers` selects all matching rows and `sendBatch` sends one network request per row. A user re-installing the PWA, re-granting permission, or hitting the registrar's mount-effect concurrently with `requestPushPermission` produces duplicate rows that fan out duplicate visible notifications. After L18, the constraint forbids duplicates at the schema layer; the subscribe route uses a single atomic `onConflictDoUpdate` that also refreshes rotated `p256dh`/`auth` keys. The fan-out math collapses to its intended ceiling (1-3 subs per user per the saturation table, not unbounded).
- **Spec NN #9** ("System-level push, not in-app toasts") and the deep-link contract carried through `lib/notify.ts` push payloads (`url: /?tab=...`). Pre-B6, the SW's `notificationclick` handler at `app/api/sw-script/route.ts:64-77` matches the first same-origin client and calls `client.focus()` without ever applying the pushed `url`; `clients.openWindow(url)` only runs when *no* client is found. Result: a parent tapping a "Bell rung" notification while the PWA is already open lands wherever they last left off, not on the lantern tab. After L19, the matched-client branch calls `client.navigate(targetUrl)` then `client.focus()`, with a try/catch fallback to focus-only for the unlikely cross-origin/restricted case.

**L18 (blocks-launch).** Concurrent registrations duplicate rows. Root cause:
- `lib/db/schema.ts:90-98` — `pushSubscriptions` has no table-level `unique()` callback. Compare with `users` at `:38-40` which does declare `unique('users_clerk_user_household_unique').on(t.clerkUserId, t.householdId)` — that is the canonical pattern this codebase already uses.
- `app/api/push/subscribe/route.ts:22-39` — explicit select-then-insert race. SELECT at `:23-25`, UPDATE branch at `:27-30`, INSERT branch at `:31-38`. Two concurrent calls with identical `(user.id, endpoint)` both observe `existing.length === 0` between SELECT and INSERT and both insert.
- `lib/push.ts:128-129, 137, 150-154` — `pushToHousehold`, `pushToUser`, `pushToUsers` all select rows by `(userId, householdId)` or `(userId)` only; duplicate rows produce duplicate `webpush.sendNotification` calls (`sendBatch` at `:66-87` iterates rows). Synthesis flagged this at 5K saturation as breaching both the performance bar (fan-out cost amplifier) and the reliability bar (every duplicate is also a duplicate user-visible notification).

**L17 (should-fix, paired).** Push pruning only handles `404|410`. Root cause:
- `lib/push.ts:73-86` — the `catch` branch on `webpush.sendNotification` discriminates `wpe?.statusCode === 404 || wpe?.statusCode === 410` into the `stale` bucket (rows queued for delete at `:78-80, 90-97`). Every other status code falls through to `result.failed++` at `:80-85` and the row is retained.
- Documented permanent-failure status codes from the Web Push provider matrix beyond 404/410: `403` (expired auth — Firebase, APNs both surface this when the subscription's auth keys have rotated server-side or been revoked), `413` (payload too large — for Homestead's small payloads this means the subscription's encryption keys are malformed, the subscription will never accept a push). Documented retryable codes: `429` (rate-limit, the provider asks us to back off, the row is still good), `5xx` (transient provider error). Pre-B6, all of these collapse into `failed` indistinguishably; the `403` rows in particular accumulate and get retried on every fan-out, inflating cost and noise.

**L19 (should-fix, paired).** Notification clicks focus existing window without applying pushed deep link. Root cause:
- `app/api/sw-script/route.ts:64-77` — `notificationclick` handler. Line 66 reads `event.notification.data?.url || '/'` into `url`. Lines 68-73 iterate matched clients; on the first same-origin match, `client.focus()` returns without ever using `url`. Line 74 `clients.openWindow(url)` only fires when the loop exits without a match (no PWA window currently open).
- `lib/notify.ts` push payloads carry `url: '/?tab=lantern'`, `url: '/?tab=shifts'`, etc. (sample at `:271` per synthesis). When the user taps a "Bell rung" notification with the PWA already open, the handler focuses the existing window and the `?tab=lantern` deep link is dropped. Fixing requires adding `await client.navigate(targetUrl)` before `client.focus()` in the matched-client branch.

**Why all three in one batch:** synthesis Theme G specifies them as a coordinated unit. L18 is the schema migration that unblocks L17's tighter prune logic — without `(user_id, endpoint)` uniqueness, the prune `DELETE` on a permanent-403 row could leave behind a duplicate row with a different id but the same endpoint that *should also* have been pruned (you'd then re-attempt the dead endpoint on the next fan-out). With uniqueness in place, the prune is a single-row delete by id (already by-id at `lib/push.ts:92`) with no duplicate-row hazard. L19 is independent on the surface (different file: SW handler, not `lib/push.ts`) but ships in the same theme because it's the third push-correctness defect from the synthesis and it's a small, isolated change — splitting it into its own batch creates more PR overhead than its diff size justifies. Single PR matches B5's pattern (L13 + L16 + L29 paired) and B4's pattern (L14 + L15 paired).

**Sequencing inside the batch:** L18 first (schema migration unblocks the others; without uniqueness, L17's tighter prune logic has to scan-and-dedup as it goes; with uniqueness, it's a single by-id delete). Then L17 (consumes the L18 invariant). Then L19 (independent of either, lowest blast radius last).

**Done criteria:**
- `lib/db/schema.ts:86-98` — `pushSubscriptions` table gains a `unique('push_subscriptions_user_endpoint_unique').on(t.userId, t.endpoint)` callback in the table-options shape, mirroring the `users` table at `:38-40`.
- `drizzle/0008_dedup_push_subscriptions.sql` — hand-written backfill migration deleting duplicate rows and keeping the one with `MAX(created_at)` per `(user_id, endpoint)` group; tiebreak on `id` (UUID) lexicographic order. See Pressure-test §1 / §9 for the SQL shape and edge cases.
- `drizzle/0009_push_subscriptions_unique_user_endpoint.sql` — kit-generated migration containing the `ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_endpoint_unique" UNIQUE("user_id","endpoint");` ALTER. Matching `drizzle/meta/0008_snapshot.json` and `0009_snapshot.json` ship in the same commit (per the 2026-05-02 snapshot-chain lesson).
- `npm run db:generate` reports "No schema changes, nothing to migrate" on a second run after generating 0009 (the snapshot-chain integrity check from B-snapshots).
- `app/api/push/subscribe/route.ts:22-39` — the SELECT + UPDATE/INSERT branches are replaced with a single `db.insert(pushSubscriptions).values({...}).onConflictDoUpdate({ target: [pushSubscriptions.userId, pushSubscriptions.endpoint], set: { p256dh: keys.p256dh, auth: keys.auth } })`. The `existing` check is gone. The 400 input-validation branch and the outer `try/catch` + `authError` shape are unchanged.
- `lib/push.ts:73-86` — the catch branch is restructured to discriminate status codes via a small file-local `classifyWebPushError(wpe)` function returning a discriminated union: `{ kind: 'prune'; reason: 'gone_404' | 'gone_410' | 'auth_403' | 'payload_413' } | { kind: 'retry'; reason: 'ratelimit_429' | 'server_5xx' } | { kind: 'unknown'; reason: 'http_<code>' | 'no_status' }`. Prune kinds collect into `staleIds` (existing path); retry and unknown kinds collect into `result.failed` and `result.errors`. The function is testable in isolation per Pressure-test §6.
- `lib/push.ts` — `PushResult.errors` items get a structured shape change: each error string is prefixed with the disposition reason (e.g., `"prune_403: HTTP 403: ..."`, `"retry_429: HTTP 429: ..."`, `"unknown_418: HTTP 418: ..."`). This preserves the existing `errors: string[]` contract (no shape change to the consumer), but the tags are JSON-grep-friendly in the `push_batch` log. See Pressure-test §3 for why this is preferred over adding a new `failures: { permanent, retryable }` field.
- `lib/push.ts:99-108` `push_batch` structured log line gets a new field `dispositions: { prune: number; retry: number; unknown: number }` (counts per kind). The existing `attempted/delivered/stale/failed/errors` fields are unchanged.
- `app/api/sw-script/route.ts:64-77` — the matched-client branch in `notificationclick` resolves `targetUrl` against `self.location.origin` and calls `await client.navigate(targetUrl)` then `client.focus()`. Wrapped in a per-iteration try/catch — on `navigate` failure (cross-origin / restricted), fall back to bare `client.focus()`. The `clients.openWindow(url)` no-match branch is unchanged.
- New `tests/push-classification.test.ts` covers the L17 status-code discriminator: 404, 410, 403, 413, 429, 500, 502, 503, 504, 418 (unknown) status codes mapped to the correct `kind` AND captured in `result.errors` with the correct disposition prefix AND counted in the new `dispositions` field of the `push_batch` log.
- New `tests/push-subscribe-upsert.test.ts` covers the L18 subscribe-route fix: spy on `db.insert` chain, assert that the route calls `onConflictDoUpdate` with `target: [userId, endpoint]` and the right `set` object; assert the route does NOT call `db.select` on `pushSubscriptions` first (the race-window-removal assertion). Mock-level test, not integration.
- New `tests/push-dedup-migration.test.ts` extends the `tests/migrations-snapshot.test.ts` precedent — assert that `drizzle/0008_dedup_push_subscriptions.sql` exists and contains a `DELETE FROM "push_subscriptions"` statement with a `MAX(created_at)` keep-clause; assert `drizzle/0009_*.sql` exists and contains `ADD CONSTRAINT "push_subscriptions_user_endpoint_unique" UNIQUE`; assert `drizzle/meta/0008_snapshot.json` and `0009_snapshot.json` exist (per the snapshot-chain lesson). This is a source-grep test, not a real-DB test — the codebase does not have integration-DB infrastructure (verified by the absence of `pg-mem`, `testcontainers`, or any `database_url` test config; `tests/migrations-snapshot.test.ts` is the precedent for asserting on migration *files* via `fs.readFile`).
- New `tests/sw-deeplink.test.ts` source-greps `app/api/sw-script/route.ts` for the `client.navigate(targetUrl)` call before `client.focus()` in the matched-client branch (matches the AppDataContext source-grep precedent from B5; SW handler is non-trivially testable at runtime without a SW harness, and Pressure-test §7 forbids new deps). Two assertions: `client.navigate` is called with `targetUrl` resolved from `event.notification.data?.url`; `client.focus()` is the second call after navigate. Falsifiable: revert the fix → both assertions fail.
- `npm run test` passes the four new test files plus the full existing suite (currently 24 files / 206 tests post-B5).
- `npm run lint` clean (zero new lint problems vs main, per B5 verification gate).
- `grep -n "existing.length > 0" app/api/push/subscribe/route.ts` returns no matches (the L18 race-window root cause is gone).
- `grep -E "wpe\?\.statusCode === 404 \|\| wpe\?\.statusCode === 410" lib/push.ts` returns no matches (the L17 narrow-prune root cause is gone — the new classifier covers a wider set).
- `grep -n "client.navigate" app/api/sw-script/route.ts` returns at least one match (the L19 deep-link fix is in place).
- `npm run db:doctor` clean (snapshot check #8 from B-snapshots fires green for both new migrations).

**Out of scope:**
- L13/L16/L29 (Theme E — shipped in B5, sha 3c4a3a9). If a fix attempt starts wanting to extend `NotifyResult` with new kinds, scope-creep interrupt fires. The classifier output stays inside `lib/push.ts` and surfaces to the existing `PushResult.errors` shape; it does not touch `lib/notify.ts`.
- L20/L21/L22/L15-index (Theme H — DB indexing pass). L18 adds a unique constraint (which Postgres implements as a unique b-tree index), so L18's index is created in the same SQL — but it is gated by L18's dedup migration and travels with the push correctness work, not the indexing pass. Theme H's `bells` / `shifts` / `users.cal_token` indexes stay in their own batch.
- L8 (typed `unauthorized()` / `forbidden()` / `rateLimited()` helpers — Theme I).
- L23/L24/L25/L26 (Theme I validation contract).
- L27 (Theme J upload security).
- The two service-worker `.catch(() => {})` patterns at `app/components/ScreenPost.tsx:45` and `app/components/HomesteadApp.tsx:236` (B5 fragile-area follow-up, not B6). Both are mount-time fetch patterns in components, not the SW handler. Different surface.
- The `notify_threw` discriminator on the bell/shifts route initial-state defaults (Stage 2 review note 4 from B5, deferred). If a fix attempt starts wanting to touch the bell/shifts route response shape, scope-creep interrupt fires — that change is on `app/api/bell/route.ts` and `app/api/shifts/route.ts` (different files from B6's surface), and it's a separate Theme E follow-up.
- `PushRegistrar` ↔ `ScreenSettings` registration-state context (B5 fragile area §1). Fully fixing the asymmetry would require lifting registration state into a shared context — out of scope, deferred to a future Theme G adjacency batch (or a frontend reorg).
- Any change to `lib/notify.ts` other than what L17's `PushResult.errors` shape strictly requires (which is zero — the consumer already does `errors: r.errors.slice(0, 3)` per `pushResultToNotify`, and the new disposition prefixes are just longer strings). If `NotifyResult.partial.errors` rendering looks wrong with the new prefixed strings, the fix is to slice the prefix off in `pushResultToNotify` — but per Pressure-test §3 the prefixed shape is intentional for log-grep, and the user-facing "partial delivery" copy in `ScreenLantern` / `ScreenPost` doesn't render the error strings (it renders fixed copy). Verified by reading `app/components/ScreenLantern.tsx` warning derivation.

## Conventions

Pattern scan of B6 surface (`lib/db/schema.ts`, `lib/push.ts`, `app/api/push/subscribe/route.ts`, `app/api/sw-script/route.ts`, `lib/auth/household.ts` for the `onConflictDoNothing` precedent, `drizzle/0007_bells_escalation_index.sql` for the most-recent-migration shape, `tests/migrations-snapshot.test.ts` for the migration-file assertion pattern, `tests/diagnostics-lantern-recipients.test.ts` for the source-grep test pattern):

- **Unique constraints declared via Drizzle's `unique(<name>).on(<col>, ...)` table-options callback.** `lib/db/schema.ts:38-40` is the canonical example: `userHouseholdUnique: unique('users_clerk_user_household_unique').on(t.clerkUserId, t.householdId)`. B6 mirrors this exactly: `userEndpointUnique: unique('push_subscriptions_user_endpoint_unique').on(t.userId, t.endpoint)`. **Do not use a column-level `.unique()` modifier** — table-options is the established codebase shape.
- **`onConflictDoNothing` is in use** (`lib/auth/household.ts:29, :60`); `onConflictDoUpdate` is **not** in use anywhere yet. B6's subscribe route is the first call site. The Drizzle API is `db.insert(table).values(...).onConflictDoUpdate({ target: [col1, col2], set: { ... } })`. Verified against `drizzle-orm` 0.45 in `package.json`. The `target` form accepts an array of `Column` references (e.g., `[pushSubscriptions.userId, pushSubscriptions.endpoint]`). **Do not use the `targetWhere` form** — not needed here, and adds API surface for no reason.
- **Migrations are kit-generated by default; hand-written when the kit can't express the operation.** `0006_village_group_default.sql` (per B-snapshots SHIPLOG) was hand-written for `SET DEFAULT`. The B6 dedup migration (0008) is also hand-written — `drizzle-kit` cannot generate "delete duplicate rows by group, keep MAX(created_at)" — but it *must* still ship with a matching `meta/0008_snapshot.json` per the snapshot-chain lesson. The 0009 unique-constraint migration is kit-generated normally (`db:generate` after the schema.ts edit produces `ALTER TABLE ADD CONSTRAINT`). Per the snapshot-chain lesson: after generating 0009, run `db:generate` a second time and confirm "No schema changes, nothing to migrate". If anything emits, the chain is broken.
- **Snapshot reconstruction for a hand-written 0008.** The cleanest path: edit `schema.ts` first (add the `unique()` callback). Run `db:generate` — kit emits `0008_<random>.sql` containing the ALTER, and `meta/0008_snapshot.json` reflecting the new state. Rename the kit's `0008_*.sql` to `0009_push_subscriptions_unique_user_endpoint.sql`. **Manually copy `meta/0007_snapshot.json` to `meta/0008_snapshot.json`** (the dedup migration's post-state is identical to the pre-constraint state — it only deletes rows). Update `meta/0008_snapshot.json`'s `id` and `prevId` to repoint the chain through the new dedup step. Update `_journal.json` to insert the 0008 entry between 0007 and 0009 with a sensible `when` timestamp (kit-generated timestamps are post-2026; manual entries fit the pattern). Then re-run `db:generate` to confirm the chain resolves cleanly. **This is the same pattern B-snapshots used** when reconstructing 0001/0004/0005 snapshots from their .sql contents — see Pressure-test §1 / §8 for the full ordering.
- **Structured log shape is established.** `lib/push.ts:99-108` is canonical: `console.log(JSON.stringify({ event: '<name>', context: '<context>', ...counters }))`. B5 extended it for `notify_*_skip`. B6 extends the existing `push_batch` log with a new `dispositions: { prune, retry, unknown }` field — this is an additive change, no shape break. **Do not invent a new event name for the disposition log;** the data belongs in `push_batch` because it describes what happened to the batch.
- **PushResult contract has 7 importers** (file scan via `grep -rn "PushResult\|pushResultToNotify" lib/ app/ tests/`): `lib/notify.ts` (consumer), `tests/notify-outcomes.test.ts` (mocks), `tests/notify-isolation.test.ts` (mocks), and `lib/push.ts` itself. The `pushResultToNotify` mapper at `lib/notify.ts` (added in B5) reads `r.reason`, `r.delivered`, `r.attempted`, `r.failed`, `r.errors`. **B6 does not change the `PushResult` field shape.** The new `dispositions` field is added to the `push_batch` log only, not to the returned `PushResult`. Reason: changing the returned shape would force B5's `pushResultToNotify` mapper to either grow new branches (scope creep into Theme E surface) or quietly drop them (waste of contract change). Keeping the `PushResult` returned shape stable is the right contract boundary; the log gets the richer view because operations consumes it directly.
- **Migration test precedent**: `tests/migrations-snapshot.test.ts` reads files from `drizzle/` via `fs.readFileSync` and asserts on their textual content (e.g., `expect(sql).toContain('ALTER TABLE')`). It does NOT spin up a DB. B6's `tests/push-dedup-migration.test.ts` follows this exact pattern. The B-snapshots SHIPLOG explicitly documents that the codebase has no integration-DB harness; a real-DB dedup test is out of scope.
- **Source-grep test precedent**: `tests/diagnostics-lantern-recipients.test.ts:48-55` reads a route file and asserts on textual patterns (`/eligible_caregivers_have_no_push_subscriptions/.test(diagSrc)`, `/pushSubscriptions/.test(diagSrc)`). B5's `tests/appdata-context-error-visibility.test.ts` extended this for component source. B6's `tests/sw-deeplink.test.ts` follows the same pattern for the SW handler — read the route file via `fs.readFileSync`, regex-match the `client.navigate` and `client.focus()` ordering. **Do not introduce an SW test harness or runtime-test the `notificationclick` handler;** the `NextResponse` returns a string of JS, and the codebase has no precedent for evaluating that string in a sandboxed SW context. Source-grep is the established compromise.
- **Auth/error contract on `/api/push/subscribe` POST stays untouched.** The `try/catch` + `authError(err, 'push:subscribe', 'Could not register for notifications')` flow is unchanged. B6 only collapses the inner SELECT-then-UPDATE/INSERT into a single upsert; the wrapping error contract is the same. L8's typed helpers are not B6's job.
- **No new dependencies.** Drizzle `onConflictDoUpdate` is already in `drizzle-orm` 0.45. `web-push`'s `WebPushError` is already imported. No new test runners, no `pg-mem`, no SW harness.

## File map

- **`lib/db/schema.ts` — edit (~3-line change at lines 86-98).** Add the table-options callback to `pushSubscriptions`:
  ```ts
  export const pushSubscriptions = pgTable('push_subscriptions', {
    // ... existing columns unchanged ...
  }, (t) => ({
    userEndpointUnique: unique('push_subscriptions_user_endpoint_unique').on(t.userId, t.endpoint),
  }));
  ```
  Mirror of `users` at `:38-40`. No column changes, no `index()` — the unique constraint creates its own b-tree.

- **`drizzle/0008_dedup_push_subscriptions.sql` — new file (~10 lines, hand-written).** Backfill the dedup before adding the constraint:
  ```sql
  -- Remove duplicate (user_id, endpoint) rows, keeping the most recent by created_at.
  -- Tiebreak on id (UUID) lexicographic order when created_at is identical.
  -- Per launch-audit-fix-batch-06-push-correctness.md Pressure-test §1 / §9.
  DELETE FROM "push_subscriptions" t1
  USING "push_subscriptions" t2
  WHERE t1.user_id = t2.user_id
    AND t1.endpoint = t2.endpoint
    AND (t1.created_at < t2.created_at
         OR (t1.created_at = t2.created_at AND t1.id < t2.id));
  ```
  Edge cases handled: identical `created_at` (tiebreak on `id`); empty table (no-op, 0 rows affected); no duplicates (no-op, 0 rows affected); kept-row's `p256dh`/`auth` may be stale if a later request would have rotated them (acceptable — next `/api/push/subscribe` from the client will `onConflictDoUpdate` with fresh keys, per L18's other half).

- **`drizzle/0009_push_subscriptions_unique_user_endpoint.sql` — new file (kit-generated, ~3 lines).** Standard ALTER:
  ```sql
  ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_endpoint_unique" UNIQUE("user_id","endpoint");
  ```
  Kit will regenerate this from the schema.ts edit; the hand-written file above is just the ordering wrapper for review.

- **`drizzle/meta/0008_snapshot.json` — new file (copy of 0007).** Manually duplicated from `0007_snapshot.json`; updated `id` and `prevId` per the snapshot-chain repair pattern from B-snapshots. Per Convention §"Snapshot reconstruction for a hand-written 0008", the dedup migration's post-state schema is identical to 0007's, so the snapshot content is identical; only the chain pointers change.

- **`drizzle/meta/0009_snapshot.json` — new file (kit-generated).** Reflects the post-constraint state. Generated by `db:generate` after the schema edit; kit's natural output, no manual fix-up beyond ensuring `prevId` points at 0008.

- **`drizzle/meta/_journal.json` — edit (~6 lines added).** Two new entries inserted between idx 7 (0007_bells_escalation_index) and any future entries: idx 8 (0008_dedup_push_subscriptions, hand-written `when` timestamp post-0007), idx 9 (0009_push_subscriptions_unique_user_endpoint, kit-generated timestamp).

- **`app/api/push/subscribe/route.ts` — edit (~15-line change at lines 22-39).** Replace the SELECT + UPDATE/INSERT branches with a single upsert:
  ```ts
  await db.insert(pushSubscriptions)
    .values({
      userId: user.id,
      householdId: user.householdId,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
    })
    .onConflictDoUpdate({
      target: [pushSubscriptions.userId, pushSubscriptions.endpoint],
      set: { p256dh: keys.p256dh, auth: keys.auth },
    });
  return NextResponse.json({ ok: true });
  ```
  The 400 input-validation branch at `:18-20` is unchanged. The outer `try/catch` + `authError(err, 'push:subscribe', '...')` shape at `:13, :42-44` is unchanged. Imports: `pushSubscriptions` already imported; `eq, and` from `drizzle-orm` — `and` becomes unused (the `eq + and` SELECT chain is gone), so drop it from the import line. `eq` may also become unused; verify with `npm run lint`.

- **`lib/push.ts` — edit (~40-line change at lines 73-108).** Two structural changes inside `sendBatch`:
  1. Add a file-local `classifyWebPushError(wpe: WebPushError): WebPushDisposition` function before `sendBatch`. Type:
     ```ts
     type WebPushDisposition =
       | { kind: 'prune'; reason: 'gone_404' | 'gone_410' | 'auth_403' | 'payload_413' }
       | { kind: 'retry'; reason: 'ratelimit_429' | 'server_5xx' }
       | { kind: 'unknown'; reason: string };

     function classifyWebPushError(err: unknown): WebPushDisposition {
       const wpe = err as WebPushError;
       const code = wpe?.statusCode;
       if (code === 404) return { kind: 'prune', reason: 'gone_404' };
       if (code === 410) return { kind: 'prune', reason: 'gone_410' };
       if (code === 403) return { kind: 'prune', reason: 'auth_403' };
       if (code === 413) return { kind: 'prune', reason: 'payload_413' };
       if (code === 429) return { kind: 'retry', reason: 'ratelimit_429' };
       if (typeof code === 'number' && code >= 500 && code < 600) return { kind: 'retry', reason: 'server_5xx' };
       return { kind: 'unknown', reason: typeof code === 'number' ? `http_${code}` : 'no_status' };
     }
     ```
  2. Restructure the catch branch in `sendBatch` (lines 73-86) to use the classifier:
     ```ts
     } catch (err) {
       const disp = classifyWebPushError(err);
       const wpe = err as WebPushError;
       const detail = wpe?.statusCode
         ? `HTTP ${wpe.statusCode}: ${wpe.body || wpe.message}`
         : (err instanceof Error ? err.message : String(err));
       if (disp.kind === 'prune') {
         result.stale++;
         staleIds.push(sub.id);
         result.errors.push(`${disp.reason}: ${detail}`);
       } else if (disp.kind === 'retry') {
         result.failed++;
         result.errors.push(`${disp.reason}: ${detail}`);
       } else {
         result.failed++;
         result.errors.push(`${disp.reason}: ${detail}`);
       }
     }
     ```
     Note that `result.stale` semantically widens: it now counts permanent-failure rows queued for delete, not just 404/410. That's L17's intended semantic. `staleIds` continues to be the cleanup queue at `:90-97`; the existing single `db.delete(pushSubscriptions).where(inArray(...))` cleanup handles the wider set with no additional code.
  3. Extend the `push_batch` structured log at `:99-108` with the new field:
     ```ts
     console.log(JSON.stringify({
       event: 'push_batch',
       context,
       attempted: result.attempted,
       delivered: result.delivered,
       stale: result.stale,
       failed: result.failed,
       dispositions: { prune: <count>, retry: <count>, unknown: <count> },  // new
       errors: result.errors.slice(0, 3),
     }));
     ```
     Track the per-kind counts in three local counters incremented inside the catch branch alongside `result.stale++` / `result.failed++`. Pre-B6: only `stale` and `failed` are visible; post-B6: operators can answer "how many rows did we prune as auth_403?" with a JSON grep on the log.

- **`app/api/sw-script/route.ts` — edit (~10-line change at lines 64-77).** The `notificationclick` handler matched-client branch:
  ```js
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
            }
            return client.focus();
          }
        }
        if (clients.openWindow) return clients.openWindow(targetUrl);
      })
    );
  });
  ```
  Changes: introduce `targetUrl` (resolved against `self.location.origin`); the matched-client branch becomes async (the `.then(async (clientList) => ...)` and `await client.navigate(targetUrl)` inside the loop); per-iteration try/catch around `navigate`; `openWindow` gets `targetUrl` instead of `url` for consistency. The `event.waitUntil(... .then(...))` outer shape is preserved. The `'focus' in client` guard is preserved (some browsers expose only a subset of the `WindowClient` interface). Note that `client.navigate` returns `Promise<WindowClient | null>`; we discard the return because we always call `client.focus()` afterward on the original reference (which stays valid even if `navigate` returns null on some browsers — the SW spec says the existing client controls the same window).

- **`tests/push-classification.test.ts` — new file (~150 lines).** Ten describe blocks covering the L17 classifier:
  1. `404 → kind: 'prune', reason: 'gone_404'` — set up a `WebPushError` mock with `statusCode: 404`, call `sendBatch` with one sub, assert the row is in the `staleIds` cleanup, assert `result.stale === 1`, assert the error string contains `'gone_404:'`, assert `dispositions.prune === 1`.
  2. `410 → kind: 'prune', reason: 'gone_410'` — same shape.
  3. `403 → kind: 'prune', reason: 'auth_403'` — same shape; this is the headline new behavior. Critically: assert the row IS pruned (in `staleIds`), not retained — the falsifiability test for L17.
  4. `413 → kind: 'prune', reason: 'payload_413'` — same.
  5. `429 → kind: 'retry', reason: 'ratelimit_429'` — assert the row is NOT in `staleIds`, assert `result.failed === 1`, assert error string contains `'ratelimit_429:'`, assert `dispositions.retry === 1`.
  6. `500 → kind: 'retry', reason: 'server_5xx'` — same.
  7. `502, 503, 504 → kind: 'retry', reason: 'server_5xx'` — three sub-cases, parametric.
  8. `418 → kind: 'unknown', reason: 'http_418'` — assert NOT pruned, error string contains `'http_418:'`, `dispositions.unknown === 1`.
  9. Mixed batch: 5 subs returning [404, 403, 429, 500, 200] — assert `delivered === 1`, `stale === 2` (404 + 403), `failed === 2` (429 + 500), `dispositions === { prune: 2, retry: 2, unknown: 0 }`, `staleIds.length === 2` (cleanup query fires once for both 404 and 403 rows).
  10. Falsifiability gate: revert the 403 branch in `classifyWebPushError` (e.g., comment out the `if (code === 403)` line) — assertions in test 3 must go red. Verify by actually reverting at green-test-write time and confirming red, then restore.

  Test mocks: `vi.mock('web-push', () => ({ default: { setVapidDetails: vi.fn(), sendNotification: vi.fn() }, WebPushError: class extends Error { statusCode: number; body: string; constructor(code: number) { super(`HTTP ${code}`); this.statusCode = code; this.body = ''; } } }))`. `vi.mock('@/lib/db', () => ({ db: { delete: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }), select: vi.fn() } }))`. Spy on `console.log` for the `push_batch` line; parse the JSON; assert on `dispositions`. Pattern matches `tests/notify-isolation.test.ts` mock shape; reuse if possible.

- **`tests/push-subscribe-upsert.test.ts` — new file (~80 lines).** Three describe blocks:
  1. `subscribe POST inserts with onConflictDoUpdate target [userId, endpoint]` — mock `db.insert(pushSubscriptions).values(...).onConflictDoUpdate(...)` chain; assert the chain is called with `target: [pushSubscriptions.userId, pushSubscriptions.endpoint]` and `set: { p256dh: '<keys.p256dh>', auth: '<keys.auth>' }`. Assert `db.select` is NOT called on `pushSubscriptions` (the race-window-removal assertion — falsifiability proof for L18).
  2. `subscribe POST returns 400 on missing endpoint/keys` — input validation unchanged, regression check.
  3. `subscribe POST surfaces authError on requireHousehold throw` — outer error contract unchanged, regression check.

  Mock pattern: `vi.mock('@/lib/auth/household', () => ({ requireHousehold: vi.fn() }))`, `vi.mock('@/lib/db', () => ({ db: { insert: vi.fn() } }))`. Build a chain mock for `insert(...).values(...).onConflictDoUpdate(...)` returning a resolved promise. **Important:** the assertion on `target: [userId, endpoint]` must compare the column references by identity (`expect(call.target).toEqual([pushSubscriptions.userId, pushSubscriptions.endpoint])`), not by string — Drizzle column references are object identities, not strings. Falsifiability gate: revert the route to use `db.select` first → the "should not call db.select" assertion goes red.

- **`tests/push-dedup-migration.test.ts` — new file (~60 lines).** Five assertions, all source-grep style (file reads via `fs.readFileSync`):
  1. `drizzle/0008_dedup_push_subscriptions.sql` exists and contains `'DELETE FROM "push_subscriptions"'` and `'MAX(created_at)'` semantics (matched via regex covering the `t1.created_at < t2.created_at OR (t1.created_at = t2.created_at AND t1.id < t2.id)` clause).
  2. `drizzle/0009_push_subscriptions_unique_user_endpoint.sql` (or the kit's actual generated name) exists and contains `'ADD CONSTRAINT "push_subscriptions_user_endpoint_unique" UNIQUE'` and `'"user_id"'` and `'"endpoint"'`.
  3. `drizzle/meta/0008_snapshot.json` exists.
  4. `drizzle/meta/0009_snapshot.json` exists.
  5. `drizzle/meta/_journal.json` has entries for both 0008 and 0009 with non-decreasing `when` timestamps (per the 2026-04-27 journal-drift lesson — monotonic-when is doctor's check, source-grep verifies it at commit time).

  Pattern matches `tests/migrations-snapshot.test.ts`. Verify imports against that file's preamble.

- **`tests/sw-deeplink.test.ts` — new file (~50 lines).** Three assertions, source-grep style:
  1. `app/api/sw-script/route.ts` source contains `client.navigate(targetUrl)` (the L19 fix is present).
  2. `client.focus()` appears AFTER `client.navigate(targetUrl)` in the matched-client branch (regex search for the line ordering inside the for-loop).
  3. `targetUrl` is resolved via `new URL(url, self.location.origin)` (the relative-to-absolute normalization is present, not a string concat).

  Falsifiability gate: revert the SW handler to the pre-B6 shape (`return client.focus()` without preceding `navigate`) → assertions 1 and 2 go red.

## Graveyard

(empty — entries dated when added)

## Anchors

- `lib/push.ts` `PushResult` shape (lines 37-44) is the source of truth for what comes back from `pushTo*` calls. B6 consumes the existing shape; the new `dispositions` field lives in the `push_batch` log only, not in the returned `PushResult`. **B5's `pushResultToNotify` mapper at `lib/notify.ts` is downstream and must not be touched** (per Out-of-scope).
- `lib/db/schema.ts:38-40` `users_clerk_user_household_unique` is the canonical unique-constraint pattern. B6 adds `push_subscriptions_user_endpoint_unique` mirroring the shape. Don't invent a new naming convention.
- `drizzle/meta/_journal.json` is the kit's source of truth for which migrations are applied; the matching `meta/<idx>_snapshot.json` files are the source of truth for diff-base. After B6: 10 migrations (0000-0009), 10 snapshots, monotonic `when` timestamps, no DAGs.
- `lib/auth/household.ts:29, :60` `onConflictDoNothing` calls are the precedent for Drizzle conflict handling in this codebase. B6 introduces `onConflictDoUpdate` — the first call site. The pattern is symmetric (object-with-`target`-array form); future call sites should follow B6's example.
- `app/api/sw-script/route.ts:64-77` `notificationclick` handler is the only SW-side notification consumer. After B6: matched-client branch navigates THEN focuses; no-match branch opens window. The `'focus' in client` guard is preserved.
- `launch-readiness-5k.md` line 50 ("Push delivery — logged for every attempt") becomes operationally true on the disposition dimension after B6: every attempt's prune/retry/unknown classification is in the structured log via the new `dispositions` field plus the prefixed error strings. Ops can grep for `auth_403` to see auth-rotation failures specifically.
- `launch-readiness-5k.md` performance bar (5K saturation: 10 bells/min × 2-10 recipients × N duplicate subs) holds at the intended ceiling after B6: no duplicate subs (constraint), no retried-permanent-4xx waste (prune set widened).
- After B6: the only `.catch(() => {})` patterns left in `app/` and `lib/` remain `app/components/ScreenPost.tsx:45` and `app/components/HomesteadApp.tsx:236` (B5's flagged future fragile-area cleanup; not Theme G). No new ones introduced.

## Fragile areas

1. **Snapshot reconstruction of 0008 is hand-coordinated.** The kit can't generate a "delete duplicates by group" SQL, so 0008 is hand-written. The snapshot must be a copy of 0007 (post-state is identical because the dedup only deletes rows; no schema change). Forgetting to copy the snapshot would silently skew the chain — the next `db:generate` would emit ALTERs that look unrelated. **Mitigation:** the convention in `Conventions` section spells out the exact ordering (edit schema.ts → kit-generate → rename to 0009 → copy 0007_snapshot.json to 0008_snapshot.json → repoint chain → verify with second `db:generate` that emits "No schema changes"). The new `tests/push-dedup-migration.test.ts` asserts both snapshot files exist; B-snapshots' doctor check #8 (warn-mode) fires if either is missing.
2. **`onConflictDoUpdate` requires the unique constraint to exist at runtime.** If the 0009 migration has not run on a given environment but the new subscribe route code is deployed, the `onConflictDoUpdate` call fails at the DB layer ("there is no unique or exclusion constraint matching the ON CONFLICT specification"). **Mitigation:** the `vercel.json` build runs `db:migrate` before `next build` (per B-snapshots SHIPLOG / synthesis L30 — note L30 flags this as a should-fix because it inverts on type-check failure, but for B6's purposes the order is correct: migrations run first, then build. If build fails post-migrate, the new schema is in but the new code isn't — meaning the route still uses the SELECT+INSERT shape, which works fine against the constrained table because the SELECT+INSERT race window has narrowed to "extremely rare" rather than "unique violation"). After this batch lands, prod will be on 0009 + new code. Staging environments without 0009 should not run this code path — verified by the existing deploy pipeline serializing migrate→build→swap.
3. **Postgres unique index on `(user_id, endpoint)` is NULL-safe by Postgres semantics: NULLs are not equal.** Both columns are `notNull` per the schema (line 92 `userId.notNull()`, line 94 `endpoint.notNull()`), so this doesn't apply here. Flagged for completeness — a future schema relaxation (making endpoint nullable) would silently allow duplicates again.
4. **The `staleIds` cleanup query at `lib/push.ts:90-97` is best-effort — `console.error` on failure, no retry.** With L17 widening the prune set to include 403/413, a transient DB error during cleanup leaves the permanent-failure row alive for the next fan-out, where it'll be classified again and re-attempted (extra cost, then eventually pruned on the next successful cleanup). This is pre-existing behavior, not introduced by B6. Flagged so future work knows the prune is eventually-consistent, not synchronous.
5. **`client.navigate` browser support varies.** Per MDN, `WindowClient.navigate` is supported in Chrome 38+, Firefox 113+, Safari 16+. The user-agent matrix for Homestead's PWA install (iOS Safari + Android Chrome per spec line 102) is well-covered; no expected runtime failures. **Mitigation:** the per-iteration try/catch around `navigate` falls back to `client.focus()` only — equivalent to the pre-B6 behavior. Older browsers degrade to "no deep link applied" silently; the user just lands wherever the existing PWA window left off. Not a new failure mode; pre-B6 was that for everyone.
6. **`tests/push-classification.test.ts` mocks `WebPushError` as a class extending Error.** The real `web-push` module exports `WebPushError` as a class with additional fields (`endpoint`, `body`, `headers`); the mock only includes `statusCode` and `body`. **Mitigation:** the classifier reads only `wpe?.statusCode`, and the formatted error string reads `wpe.body || wpe.message`. Both fields are mocked. A future change that adds a `wpe.endpoint`-conditional branch would need the mock extended; flag at that time.
7. **Source-grep tests are brittle to formatting changes.** `tests/sw-deeplink.test.ts` matches `client.navigate(targetUrl)` and `client.focus()` literally. A future Prettier reformat that breaks the call across lines, or a refactor that renames `targetUrl` → `target`, fails the test silently (red, not vacuous-pass). **Mitigation:** keep the regex permissive enough to match common formatting (`client\.navigate\(\s*\w+\s*\)` covers reformats); but tight enough to fail on reverts. Document the intent in a leading test comment so future operators know what the test is gating.
8. **The B5 lesson "regression tests must spy on the actual gate" applies directly.** For L17 tests: the regression class is "row is not pruned for permanent 403" — assert the row's id is in `staleIds` (the gate is the prune-vs-retain decision), not just that "row is gone after sendNotification threw 403" (the eventual DB DELETE) — because the DB DELETE happens for any row classified as `prune`, including 404/410 which were already pruned pre-B6. A regression that strips the 403 branch but leaves 404/410 intact would slip past a test that only asserts on the eventual DELETE. The classification site is the gate; spy on it. For L18 tests: assert `db.select` is NOT called (the race-window-removal gate), not just that the upsert eventually succeeds. For L19: assert ordering of `client.navigate` then `client.focus`, not just that the handler fires.

## Pressure-tested decisions (Protos §"Plan-reviewer" requirements)

### §1 — Migration shape for L18: single migration vs two-migration sequence

User's prompt named two options:
- **Option A:** Drizzle unique index added to schema.ts; `db:generate` produces a single CREATE UNIQUE INDEX migration plus a backfill SQL that deletes duplicates before the index lands.
- **Option B:** Same index, but ship the backfill as a separate migration ahead of the unique index — two-migration sequence (`0008_dedup_push_subscriptions.sql` → `0009_unique_user_endpoint.sql`).

User's default position: **Option B.** **Default holds.**

Justification (refining the prompt's argument):

1. **Atomic-rollback unit.** A single migration that does `DELETE … ;` then `ALTER TABLE … ADD CONSTRAINT …` runs as a single transaction by default in Postgres. If the ALTER fails (e.g., a duplicate row that the DELETE didn't catch because of an edge case in the GROUP BY clause), the entire transaction rolls back — no harm done. *But* if the DELETE has a bug and over-deletes, and the ALTER succeeds, the data loss is committed. Splitting into two migrations means each migration's blast radius is one operation, and each can be inspected/reviewed independently. The dedup migration leaves the table in a state the existing code (pre-B6) handles correctly; the constraint migration changes the schema in a way the existing code also handles (UPDATE/INSERT both succeed against a constrained table — the only behavioral change is on duplicate-violation, which the existing code never triggers because of the prior SELECT). Each migration is independently revertible.

2. **Reviewability.** Two migrations, each in its own `.sql` file, are easier to review than a single file mixing DELETE and ALTER. A reviewer can pattern-match "this is the dedup; this is the constraint" without having to mentally split a single SQL block. Matches B-snapshots' precedent (it shipped `0006_village_group_default.sql` as a separate file from the prior enum-backfill rather than concatenating).

3. **Failure observability.** If `db:migrate` fails mid-batch in prod, `_journal.json` records the last applied migration. With two migrations, "applied 0008, failed 0009" is an unambiguous ops signal: the dedup ran, the constraint didn't, the data is in a known intermediate state and the next deploy retries from 0009. Single migration: "0008 failed" leaves ambiguity about whether the DELETE ran before the ALTER aborted.

The cost of Option B: one extra file, one extra journal entry, one extra snapshot file. Five-minute marginal cost. Pays for itself the first time a migration partially fails.

**Argument against Option B that I considered and rejected:** "Two migrations means a window where 0008 has run but 0009 hasn't, during which the schema is unconstrained but the dedup state is committed. A concurrent insert during that window could create a new duplicate, which would then violate 0009 and fail the migration." Verified: the migration window is single-transaction in Vercel's deploy pipeline (`db:migrate` runs both migrations sequentially before traffic shifts), and the production environment runs no concurrent `/api/push/subscribe` traffic during the migrate phase (build runs before traffic is swapped). Window is closed. Even if it weren't, a 0009 ALTER failure would surface at deploy time with a clear "duplicate violates constraint" error — a known and recoverable state, not silent data loss. Rejected.

### §2 — Subscribe route upsert shape: `onConflictDoUpdate` vs SELECT-FOR-UPDATE vs catch-violation-do-nothing

User's prompt named three options:
- **Option A:** `onConflictDoUpdate({ target: [userId, endpoint], set: { p256dh, auth } })` — atomic, single statement, depends on the L18 unique index.
- **Option B:** Wrap the existing SELECT-then-INSERT in a transaction with `SELECT ... FOR UPDATE` — atomic but more roundtrips.
- **Option C:** "Always insert, catch unique-violation, do nothing" — simpler but loses the credential-refresh case where `p256dh`/`auth` keys rotate.

User's default position: **Option A.** **Default holds.**

Justification (refining):

1. **Credential refresh matters.** Browsers rotate VAPID keys (`p256dh`/`auth`) on certain events (re-grant, profile reset, some kinds of cache wipe). The existing code's UPDATE branch is doing the right thing — refreshing the keys when an endpoint re-subscribes. Option C drops this: a re-subscribe with rotated keys becomes a no-op, and the next push with the old keys fails (401 from the provider, classified as `auth_403` by L17, row is pruned). The user re-subscribes again, and the cycle restarts. Cost: one extra failed push per credential rotation per user. Multiply across 5K users with iOS doing periodic key rotation — material.
2. **`onConflictDoUpdate` is a single statement that the DB plans optimally.** Postgres handles ON CONFLICT atomically inside the executor; no application-layer race window, no extra roundtrips. Drizzle's API surface is clean (`.values(...).onConflictDoUpdate({ target: [...], set: { ... } })`).
3. **`SELECT FOR UPDATE` (Option B) is heavier and requires a transaction wrapper.** It also requires the row to exist for the lock to attach to anything — the first-time insert case has no row to lock, so the FOR UPDATE degenerates to a regular SELECT, leaving the same race window for the first-insert race (two concurrent first-time subscribes both observe "no row exists" and both INSERT). Option B closes the same-row race but not the first-row race. A `SELECT FOR UPDATE` + `IF NOT FOUND THEN INSERT` requires either advisory locking on the `(user_id, endpoint)` tuple or accepting the unique-constraint check at INSERT time anyway. At which point Option A is strictly simpler.
4. **`onConflictDoUpdate`'s `target` accepts a column array, not a constraint name.** This decouples the application code from the constraint's internal name (`push_subscriptions_user_endpoint_unique`). If the constraint is ever renamed (it shouldn't, but…), the application code keeps working. Postgres's `ON CONFLICT (user_id, endpoint)` matches any unique constraint covering exactly those columns.

The cost of Option A: hard dependency on L18's unique constraint existing at runtime — covered in Fragile area §2.

**Argument against Option A that I considered and rejected:** "What if a future change splits the row by `householdId` (e.g., a caregiver in two households uses the same browser endpoint, gets one row per household)? The (user_id, endpoint) uniqueness collapses both rows." Verified: per-household identity model (spec NN #3) means a caregiver in N households has N `users` rows with N distinct `users.id` values, even when they're the same Clerk user. Each `users.id` has its own subscriptions; the (user_id, endpoint) uniqueness is keyed by the per-household user, not the Clerk user. Two households, same browser endpoint → two rows with different `user_id`, no collapse. Endpoint is unique per push subscription per browser; sharing across users of the same browser is intentional (each per-household user gets their own pushes). Rejected.

### §3 — Push-result classification taxonomy for L17: keep `stale` semantic vs add `failures: { permanent, retryable }` field

User's prompt named two options:
- **Option A:** keep the boolean stale/failed split, just expand "stale" to mean "any permanent failure that should remove the row."
- **Option B:** add a new classified field — `failures: { permanent: number; retryable: number; deliveryAttempted: number }` — and let the caller see the breakdown.

User's default position: **Option A.** **Default holds with a refinement.**

Justification:

1. **`PushResult.stale` semantic is "this row is dead, prune it,"** which is exactly what L17 wants. Widening the input set (404, 410, 403, 413) to that bucket doesn't change the bucket's meaning — it changes which inputs map to it. The contract with the consumer (`pushResultToNotify` in B5's `lib/notify.ts`) doesn't care whether the row was 404 or 403; it cares whether the row is dead. Same for `failed`: "this attempt didn't deliver and we don't know if a retry would help."
2. **Adding a new `failures: { permanent, retryable }` field has blast radius.** It changes the `PushResult` shape consumed by the B5 mapper. The mapper's signature at `lib/notify.ts` (per B5 plan §1) reads `r.reason`, `r.delivered`, `r.attempted`, `r.failed`, `r.errors`. Adding `r.failures.permanent` would require either (a) updating the mapper to consume the new field (Theme E surface — scope creep) or (b) leaving the mapper alone and having two parallel "what's the disposition" representations in `PushResult`, which is worse than just one.
3. **Operations need the breakdown, but operations consumes the log, not the return value.** The `push_batch` log line is what gets scraped; adding `dispositions: { prune, retry, unknown }` there gives operations exactly the breakdown they need without changing the in-process contract. The log is the right place for ops-grade detail; the return value is the right place for caller-relevant binary signals.

**Refinement to the default:** the `result.errors` array gets disposition prefixes (`auth_403: HTTP 403: …`). This is a soft contract change — the existing consumers slice the first 3 errors and either log them (the `push_batch` log already does this) or pass them through (B5's `pushResultToNotify` returns them as `errors: r.errors.slice(0, 3)` on the `partial` branch). The user-facing rendering in `ScreenLantern` and `ScreenPost` (per B5 plan §"File map") does NOT render the error strings — it renders fixed copy per `kind`. So the prefix change is invisible to the user-facing surface and structural for the log-grep surface. That's the right balance.

**Argument for Option B that I considered and rejected:** "If a future feature wants to surface 'this user has 5 permanent-failed subscriptions, prompt them to re-subscribe' to the UI, the structured field is more usable than the prefix-parsed strings." Verified: that's a TODO.md-shaped feature, not a launch gate; it's not in synthesis L1-L30; it's not in Theme G's scope. YAGNI. If/when it lands, Option B can be adopted as an additive change at that time. Rejected.

### §4 — Status-code classification for L17: which codes are permanent vs retryable

User's prompt named the documented codes:
- **Permanent (prune):** 404, 410 (existing); 403 (expired/invalid auth — Firebase, APNs); 413 (payload too large).
- **Retryable (retain):** 429 (rate-limit); 500/502/503/504 (transient).

User's default position: **403 + 413 permanent; 429 + 5xx retryable; everything else stays "failed without prune" (unknown).**

**Default holds.** Justification:

1. **Conservative classification for unknowns.** Per the plan (the `unknown` branch counts toward `result.failed` and `result.errors` but not `result.stale`), an unrecognized status code does NOT prune the row. Reason: a real provider error we don't recognize (e.g., a new RFC 8030 status code, or a provider-specific extension) shouldn't get a row pruned silently. The cost of a missed prune on an unknown is one extra retry on the next fan-out — small, observable. The cost of a wrong prune on an unknown is the user has to re-subscribe — large, invisible. Asymmetry favors retain.
2. **403 inclusion (Firebase / APNs auth rotation).** Both Firebase Cloud Messaging and Apple's APNs surface 403 (FCM: `UNAUTHORIZED_REGISTRATION`, APNs: `BadDeviceToken`) when the subscription's keys have been rotated server-side or revoked. The auth keys cannot recover; only re-subscribing fixes it. Pruning is correct. Empirically the most common new prune case beyond 404/410.
3. **413 inclusion (payload too large).** Homestead's notification payloads are tiny (title + body + url + tag, ~200 bytes). A 413 means the subscription's encryption keys are malformed (the encrypted payload is larger than the provider's limit because of an encryption-layer bug or corrupted keys). The subscription will never accept a push — pruning is correct.
4. **429 retain.** The provider is asking us to back off; the row is still good. Retrying on the next fan-out (10 bells/min cycle in the saturation table is well below any provider's per-IP rate limit; the 429 would be sub-account or sub-endpoint and transient). Retain.
5. **5xx retain.** Transient provider errors. Retain.

**Argument against including 413 that I considered and rejected:** "413 is so rare in practice that adding it adds noise to the prune set without a real signal." Verified: rare, yes. But the decision rule is "is this row recoverable?" not "is this code common?" 413 with Homestead's payload size implies a permanent problem with the subscription, not the payload. Including it costs one classifier branch and one test; the alternative is leaving real permanent failures retried forever. Rejected.

**Argument for being more aggressive (e.g., pruning all 4xx) that I considered and rejected:** "Just prune any 4xx that isn't 429 — simpler classifier." Verified: 400 (bad request, e.g., we sent a malformed payload — that's our bug, not the subscription's bug; pruning would mask the bug), 401 (auth — could be our VAPID setup, not the row), 402 (payment required — provider billing, retry-after-fix), etc. These should NOT be pruned. The conservative classifier is right. Rejected.

### §5 — SW deep-link fix for L19: navigate-then-focus vs navigate-with-fallback

User's prompt named two options:
- **Option A:** in `notificationclick`, when a matching client is found, call `client.navigate(targetUrl)` THEN `client.focus()`.
- **Option B:** same but wrap navigate in a try/catch and fall back to focus-only if navigate throws (some browsers reject navigate when the URL is cross-origin or otherwise restricted).

User's default position: **Option B.** **Default holds.**

Justification (refining):

1. **The deep links are all same-origin** (`/?tab=lantern`, `/?tab=shifts`, etc., resolved via `new URL(url, self.location.origin)`). So `navigate` *should* always succeed in the well-behaved case. The try/catch isn't strictly needed for correctness today.
2. **But the cost of the try/catch is two lines, and the downside of `navigate` throwing inside the SW `notificationclick` handler is that the user sees no response at all** — the click "does nothing" (the `event.waitUntil` promise rejects, the SW logs an error, and from the user's POV they tapped a notification and the app didn't respond). This is the worst possible UX failure mode for a notification: a silent dead-end. The try/catch's cost is "navigate didn't apply; user lands on whatever tab they last had" — which is exactly the pre-B6 behavior, indistinguishable from L19 not being shipped at all. Strictly better than silence.
3. **Defensive code in a handler this close to the user is worth two lines.** SW `notificationclick` is one of the most user-visible code paths in the app; it's the moment the user is choosing to engage with a push. A throw here is a reliability-bar break.

**Argument against Option B that I considered and rejected:** "If `navigate` fails for a reason we'd want to know about (e.g., URL is malformed because of a bug in `lib/notify.ts`), swallowing the error in the catch hides the bug." Verified: the catch block can include a `console.warn('[sw:notificationclick] navigate failed', e)` line for observability without throwing. The code in the plan as written has a comment but no log; refining: add a one-line `console.warn` inside the catch. The SW `console` is visible in `chrome://serviceworker-internals` and comparable Safari tooling — operations can grep. Refined; default holds with the additional log line.

### §6 — Test strategy

L17 tests live in `tests/push-classification.test.ts` (10 cases including the falsifiability gate). L18 tests in `tests/push-subscribe-upsert.test.ts` (3 cases) and `tests/push-dedup-migration.test.ts` (5 source-grep assertions). L19 tests in `tests/sw-deeplink.test.ts` (3 source-grep assertions). Four new files; no existing test extension.

**Per the 2026-05-02 "spy on the gate" lesson:**
- **L17 tests assert on the classification site** (the if/else that maps status codes to prune/retain/unknown), not just on the eventual DELETE. The gate is the discriminator. A regression that strips the 403 branch but leaves the DELETE statement intact would be caught — the test for 403 asserts the row's id is in `staleIds` AND the error string contains `auth_403:` AND `dispositions.prune` includes the count. Spy on the structured log's `dispositions.prune` field, not just on the row count.
- **L18 tests assert that `db.select` is NOT called** (the race-window-removal gate), not just that the upsert eventually succeeds. A regression that re-introduces the SELECT-before-INSERT shape would be caught.
- **L19 tests assert on call ordering** (`client.navigate(targetUrl)` before `client.focus()`), not just on the handler firing. A regression that calls only `focus()` would be caught.

**Per the 2026-05-02 "discriminated-union return type catches silent-success" lesson:**
- The L17 classifier's return type is a discriminated union (`{ kind: 'prune' | 'retry' | 'unknown' }`). Tests assert on `kind` exhaustively for all input ranges — the boundary cases (200 success, 400 unknown, 600 unknown) need their own assertions to confirm the classifier doesn't silently fall through to a default behavior on input it didn't expect. Test 8 (418) covers the unknown branch; the falsifiability gate (test 10) confirms a removed branch is caught.

**Falsifiability check before declaring tests done:** for each new test, mentally (or actually) revert the fix it claims to cover and re-run. Test must go red. Four new test files × ~15 cases × ~30 seconds per revert-rerun ≈ 7-8 minutes. Worth it; this is the routine that closed the B5 Stage 2 finding.

**Anti-pattern to avoid:** asserting on the new `dispositions` field's exact value when only a single sub is in the batch. Use the mixed-batch case (test 9) as the cross-check: with a deliberate mix of 5 dispositions, the field's value is verifiable end-to-end.

### §7 — Scope boundary with L13/L16/L29 (Theme E shipped), L20/L21/L22/L15 (Theme H), L8/L23/L24/L25/L26 (Theme I), L27 (Theme J), L28/L30 (Theme K)

Hard list of what B6 does NOT touch:

- **Theme E (shipped in B5, sha 3c4a3a9):** L13/L16/L29. `lib/notify.ts` is downstream of `lib/push.ts`'s `PushResult` shape; B6 does not touch `notify.ts`. The B5 `pushResultToNotify` mapper continues to consume the existing `PushResult` shape unchanged. `app/api/bell/route.ts` and `app/api/shifts/route.ts` POST routes are not on B6's surface. `app/components/ScreenLantern.tsx`, `ScreenPost.tsx`, `ScreenSettings.tsx`, `AppDataContext.tsx` are not on B6's surface. The two SW `.catch(() => {})` patterns at `ScreenPost.tsx:45` and `HomesteadApp.tsx:236` flagged for a future fragile-area cleanup batch — NOT B6.
- **Theme H (DB indexing pass):** L20 (`bell_responses(bell_id)` + `bells(household_id, status, ends_at)`), L21 (shifts composite indexes), L22 (`users.cal_token` unique-where-not-null + ICS feed time-bound + cache), L15-index (escalation index — already shipped in B4 sha c13e848 per SHIPLOG). Even though L18's unique constraint creates a b-tree internally (Postgres represents UNIQUE as an index), L18 is a correctness fix, not part of the indexing pass. Theme H's other indexes stay in their own batch.
- **Theme I (validation contract):** L8 (typed `unauthorized()`/`forbidden()` helpers), L23 (time-range validator for bell/shifts/unavailability POST), L24 (UUID param parser for `[id]` routes), L25 (family-invite rate limit), L26 (feedback rate limit + body-size cap). The `/api/push/subscribe` POST route already uses `requireHousehold()` + `authError()` — that contract is unchanged by B6. If a fix attempt starts wanting to migrate the subscribe route to typed `unauthorized()`/`forbidden()`, scope-creep interrupt fires.
- **Theme J (upload security):** L27 (upload route magic-byte sniff + private blob + EXIF strip). Different file, different surface.
- **Theme K (schema authority + ops):** L11 (snapshot drift — closed by B-snapshots), L12 (raw-script audit — separate batch), L28 (Sentry env vars in `.env.example`), L30 (`engines` pin + migration ordering in `vercel.json`). L30 is adjacent because B6's L18 adds a migration that runs in the `vercel.json` `buildCommand` — but L30's fix is to MOVE migrations OUT of the build command, which would change the deploy ordering for B6. Decision: B6 keeps the existing `vercel.json` ordering (migrations before build); L30 is a future batch.
- **`notify_threw` discriminator on the bell/shifts route initial-state defaults** (B5 Stage 2 review note 4, deferred). If a fix attempt starts wanting to touch the bell/shifts route response shape, scope-creep interrupt fires — that change is on `app/api/bell/route.ts` and `app/api/shifts/route.ts` (different files from B6's surface).

The B6 surface is exactly: `lib/db/schema.ts` (3-line edit), `drizzle/0008_dedup_push_subscriptions.sql` (new), `drizzle/0009_push_subscriptions_unique_user_endpoint.sql` (new, kit-generated), `drizzle/meta/0008_snapshot.json` (new, copy of 0007), `drizzle/meta/0009_snapshot.json` (new, kit-generated), `drizzle/meta/_journal.json` (2 entries added), `app/api/push/subscribe/route.ts` (~15-line change), `lib/push.ts` (~40-line change), `app/api/sw-script/route.ts` (~10-line change). Plus four new test files. **6 production code/config files (5 source + 1 schema) + 5 migration artifacts + 4 test files.** Anything more is scope creep.

### §8 — Migration ordering safety (per B-snapshots lesson)

The 2026-05-02 snapshot-chain lesson is directly load-bearing. Every `drizzle/<tag>.sql` must have a matching `drizzle/meta/<idx>_snapshot.json`, and after `db:generate`, run `db:generate` a second time to confirm "No schema changes, nothing to migrate." If the second run emits anything, the snapshot chain is broken. `db:doctor`'s check #8 (snapshot existence, currently warn-mode per B-snapshots SHIPLOG) catches this — verify it fires clean before commit.

**B6 build sequence for the migration (the operationally critical part):**
1. Edit `lib/db/schema.ts:86-98` to add the `unique('push_subscriptions_user_endpoint_unique').on(t.userId, t.endpoint)` callback.
2. Run `npm run db:generate`. Kit emits `drizzle/0008_<random>.sql` containing `ALTER TABLE … ADD CONSTRAINT …` AND `drizzle/meta/0008_snapshot.json` reflecting the constrained state.
3. **Rename the kit's output:** `drizzle/0008_<random>.sql` → `drizzle/0009_push_subscriptions_unique_user_endpoint.sql`. **Rename the snapshot:** `drizzle/meta/0008_snapshot.json` → `drizzle/meta/0009_snapshot.json`. Update `_journal.json` to rename the entry's `tag` field similarly.
4. **Hand-write `drizzle/0008_dedup_push_subscriptions.sql`** with the DELETE-by-group statement (per File map).
5. **Copy `drizzle/meta/0007_snapshot.json` to `drizzle/meta/0008_snapshot.json`** (the dedup migration's post-state schema is identical to 0007 — no schema change, only data deletion). Update the new `0008_snapshot.json`'s `id` field (UUID-format, per kit convention) and `prevId` field (point at `0007_snapshot.json`'s id). Update `0009_snapshot.json`'s `prevId` to point at `0008_snapshot.json`'s new id.
6. **Edit `_journal.json`** to insert idx 8 (0008_dedup_push_subscriptions, hand-written `when` timestamp slightly post-0007's), and update idx 9 (0009_push_subscriptions_unique_user_endpoint, kit-generated timestamp may need bump).
7. **Run `npm run db:generate` a second time.** Must report "No schema changes, nothing to migrate." If it emits anything, the chain is broken — diagnose and fix before commit.
8. **Run `npm run db:doctor`.** Must be clean (warn-mode check #8 fires green for both new migrations).
9. Verify with `tests/push-dedup-migration.test.ts` source-grep assertions before commit.

This is the same pattern B-snapshots used (per SHIPLOG sha b3fee55). Empirically: kit rejects DAGs (B-snapshots discovered this when first attempting to add 0001's snapshot with `prevId` pointing at 0000's id but 0002's `prevId` still pointing at 0000's id — kit failed with parent-collision). The chain must be linear.

### §9 — Backfill safety on the dedup migration

The backfill DELETE is "for each (user_id, endpoint) group with > 1 rows, keep the row with `MAX(created_at)`, delete the others." Edge cases:

(a) **Two rows with identical `created_at`** (unlikely but possible if two requests hit the DB inside the same transaction tick, especially given the existing race window). Tiebreak on `id` (UUID): keep the lexicographically larger. Implemented in the SQL as `t1.created_at < t2.created_at OR (t1.created_at = t2.created_at AND t1.id < t2.id)` — t1 is the row to delete, t2 is a row that "beats" t1. Both halves of the tiebreak ensure exactly one row per group survives.

(b) **The "kept" row's `p256dh`/`auth` may be stale** if a later request would have rotated them. Acceptable: the next `/api/push/subscribe` call from the client will `onConflictDoUpdate` with fresh keys. Worst case is one extra failed push (returns 403, classified as `auth_403` by L17, row pruned), then the user re-subscribes via the registrar. Fits inside the L17 prune semantics.

(c) **Running the backfill against an empty table is a no-op.** Postgres's DELETE … USING with no rows produces 0 affected rows. Safe.

(d) **No duplicates at all is also a no-op.** The WHERE clause requires `t1.user_id = t2.user_id AND t1.endpoint = t2.endpoint` AND `t1` strictly losing to `t2` on the tiebreak — for a unique (user_id, endpoint) pair, there's no t2 that satisfies both halves of the tiebreak (every row's t2 is itself, and `t1.created_at < t2.created_at` is false when they're the same row). The DELETE selects 0 rows. Safe.

(e) **The DELETE-by-USING shape** (PostgreSQL-specific) is the canonical "delete duplicates by group" idiom. Verified against Postgres docs; no transaction-isolation gotchas at READ COMMITTED (the default Drizzle migration transaction level). Migrations run in a single transaction by default, so even if a concurrent INSERT tries to add a duplicate during the migration window (which shouldn't happen because deploy serializes migrate→build→swap), the constraint added in 0009 would catch it on commit.

(f) **Production data scale.** At current beta usage (handful of users), <100 push_subscriptions rows total. Even at 5K saturation (the launch target), the table is bounded by 5K users × 1-3 subs = 15K rows. The DELETE-by-USING is O(n²) in worst case with the cross-join, but with an index on (user_id, endpoint) — which doesn't exist yet but the query optimizer can use the unique constraint that 0009 adds — performance is fine. Even without the index, 15K × 15K = 225M comparisons is a few seconds at most. Pre-launch staging should validate against representative data; flagged in Fragile area §1.

Migration-runtime safety: the 0008 transaction completes in <1 second on bounded data; the 0009 ALTER acquires a brief table-level lock to add the constraint. Combined deploy-migration window is <5s, well within Vercel's deploy migration phase budget.

## Regression tests required (Hard Rule #6)

- **`tests/push-classification.test.ts`** — 10 cases per File map. Each test asserts the classifier returns the expected `kind` AND `result.stale`/`result.failed`/`result.errors` AND `dispositions` counters. Falsifiability proof: revert the L17 classifier (remove the `403` branch in `classifyWebPushError`) — test 3 (403 → prune) must go red.

- **`tests/push-subscribe-upsert.test.ts`** — 3 cases per File map. Asserts the route calls `onConflictDoUpdate` with `target: [pushSubscriptions.userId, pushSubscriptions.endpoint]` AND does NOT call `db.select` on `pushSubscriptions`. Falsifiability proof: revert the route to use `db.select` first (the pre-B6 SELECT-then-INSERT shape) — the "should not call db.select" assertion must go red.

- **`tests/push-dedup-migration.test.ts`** — 5 source-grep assertions per File map. Asserts the migration files exist, contain the right SQL semantics, and have matching snapshots and journal entries. Falsifiability proof: rename `drizzle/meta/0008_snapshot.json` to a temp filename — assertion 3 must go red. Restore. Or remove the journal entry for 0008 — assertion 5 must go red.

- **`tests/sw-deeplink.test.ts`** — 3 source-grep assertions per File map. Asserts the SW handler source contains `client.navigate(targetUrl)` before `client.focus()` in the matched-client branch AND that `targetUrl` is normalized via `new URL(url, self.location.origin)`. Falsifiability proof: revert the SW handler to the pre-B6 shape (remove the `navigate` call) — assertions 1 and 2 must go red.

Verification gates before declaring B6 done:
- `grep -n "existing.length > 0" app/api/push/subscribe/route.ts` returns no matches (the L18 race-window root cause shape gone).
- `grep -E "wpe\?\.statusCode === 404 \|\| wpe\?\.statusCode === 410" lib/push.ts` returns no matches (the L17 narrow-prune root cause gone).
- `grep -n "client.navigate" app/api/sw-script/route.ts` returns at least one match (the L19 deep-link fix in place).
- `npm run db:generate` reports "No schema changes, nothing to migrate" on a second run after generating 0009 (the snapshot-chain integrity check from B-snapshots).
- `npm run db:doctor` clean.
- `npm run test` — full suite passes; new files contribute ~21 new cases (10 + 3 + 5 + 3).
- `npm run lint` — clean (zero new lint problems vs main, per B5 verification gate methodology).

## Stretch / non-blocking

- **Promote `db:doctor` check #8 from warn → error.** B-snapshots SHIPLOG flagged this as an intentional gradual rollout. After B6 lands cleanly with the new 0008/0009 snapshots, the next batch should promote the check; ~3-line edit. Worth folding into a future `chore/` PR or a Theme K batch.
- **Add a dedicated `failures: { permanent, retryable }` field to `PushResult`.** Per Pressure-test §3, deferred. If a future feature needs structured access to the disposition breakdown beyond the log (e.g., a "you have N permanent-failed subscriptions" UI), this is the upgrade path.
- **Lift `PushRegistrar` ↔ `ScreenSettings` registration state into a shared context.** B5 Fragile area §1. Closes the asymmetry where the registrar's mount-time subscribe failure isn't visible in Settings. Worth a separate batch when push-related UI gets revisited (Theme G adjacency).
- **`notify_threw` discriminator on the bell/shifts route initial-state defaults.** B5 Stage 2 review note 4. Currently the catch-block default is `{ kind: 'push_error', recipients: 0, error: 'notify_threw' }`; a dedicated `reason: 'notify_threw'` field on `push_error` would slice cleaner in logs. ~5-line follow-up.
- **Migrate `app/components/ScreenPost.tsx:45` and `app/components/HomesteadApp.tsx:236` away from `.catch(() => {})`.** B5 follow-up; both are mount-time fetch patterns. Low-risk; not Theme G; defer to a "fragile area cleanup" batch.
- **`vercel.json` migration-ordering fix (L30).** Move `db:migrate` out of `buildCommand` to a release-phase script that runs after build success. B6's migrations work fine under the existing pre-build-migrate ordering, but L30's underlying concern (a failed type-check post-migrate leaves prod with new schema and old code) is real and worth fixing in Theme K.
- **Real-DB integration test for the dedup migration.** Source-grep tests prove the SQL exists and contains the right shape; they can't prove the SQL actually deduplicates correctly under concurrent insertions or weird tiebreak edge cases. A real-DB test (using `pg-mem`, `testcontainers`, or a temporary Neon branch) would close that gap. Not blocking; flag for a future testing-infrastructure batch.
