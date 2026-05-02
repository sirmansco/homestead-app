---
title: Launch fix batch 03 — Member tombstone service / FK-restrict safety + admin Clerk-membership drop
date: 2026-05-02
status: shipped
shipped-as: PR #48, sha e2588ea
governs: L9 (primary); L2 delete-safety half (closes today's deferred 5xx); SHIPLOG B2 follow-up (admin village-DELETE Clerk-membership drop)
parent-audit: docs/plans/launch-audit-2026-05-02/synthesis.md
batch-id: B3
prereqs: B2 (`POST /api/village/leave` exists; village DELETE is admin-only; `requireHouseholdAdmin()` available)
unblocks: none on the L9 chain — Theme B closes here. Theme A continuation (L1 invite-accept anonymous GET) is independent.
---

## Spec

A single tombstone service is the only path used to remove a `users` row from any **per-household removal** flow (admin removes other; caregiver leaves self). The service:

1. Detects authored history on the two `ON DELETE restrict` FKs (`shifts.createdByUserId`, `bells.createdByUserId`).
2. If zero history → hard-deletes the row.
3. If any history → anonymizes in place using the canonical `[deleted]` placeholder pattern from `app/api/account/route.ts:127-137` (per spec NN #16b). PII columns (`name`, `email`, `photoUrl`, `clerkUserId`) are stripped/replaced; `users.id` is preserved so authored shifts/bells continue to resolve.
4. Before the delete-or-anonymize, cancels future shifts the row created and nulls out `claimedByUserId` references (the same pre-cleanup `account/route.ts` already performs).
5. Returns a discriminated outcome `{ kind: 'deleted' } | { kind: 'anonymized', reason: { authoredShifts, authoredBells } }`. **Never throws on FK-restrict** — that's the whole point.
6. Does NOT touch Clerk. Clerk side-effects are caller-owned (see Pressure-test §3 below for why).

After this batch, calls to `db.delete(users)` from `app/api/village/leave/route.ts:20`, `app/api/village/route.ts:98`, and `app/api/household/members/[id]/route.ts:47` are replaced by the service. `app/api/account/route.ts:127` is **left alone** in this batch (deferred — see Pressure-test §5). The grep `db.delete(users)` returns matches only in the new service file and `account/route.ts`.

Coupled fix: admin village-DELETE (`app/api/village/route.ts:98`) currently never drops the target's Clerk org membership while `members/[id]/route.ts:49-63` does. B2 SHIPLOG follow-up flagged this as worth folding in. B3 folds it in — same line is being touched, parity matters, and asymmetric Clerk state is itself a data-integrity defect (a "removed" caregiver can re-enter on next sign-in via the surviving org membership).

**Done criteria:**
- `lib/users/tombstone.ts` exists; exports `tombstoneUser({ userId, householdId })` returning the discriminated outcome above.
- `app/api/village/leave/route.ts`, `app/api/village/route.ts` (DELETE-adult branch), `app/api/household/members/[id]/route.ts` (DELETE) all call the service. The DELETE branches retain their existing `householdId` scoping (the service operates on a `(userId, householdId)` pair, never global).
- `app/api/village/route.ts` admin-DELETE-adult adds the same Clerk-org-membership drop currently in `members/[id]/route.ts:49-63`. The Clerk drop is logged on failure (Hard Rule #3 — current `members/[id]` bare `catch {}` is a latent violation; B3 fixes both).
- Response shapes stay `{ ok: true }` for all three caller routes (no client breakage; outcome is logged server-side, not surfaced — see Pressure-test §6 below).
- Regression test asserts: (a) author-with-no-history removal → row gone; (b) author-with-history removal → row tombstoned, `users.id` preserved, related shift/bell rows survive intact; (c) no 5xx in either case; (d) admin village-DELETE-adult drops Clerk org membership via mocked `clerkClient`.

**Out of scope:**
- `app/api/account/route.ts` migration to the new service. Deferred — see Pressure-test §5.
- Schema changes to FK constraints. The `restrict` is the data-integrity safety net; B3 makes app code respect it (per existing scaffold's anchor and synthesis L9 fix shape).
- Tombstone-row exclusion from village/notification reads. Anonymized rows still appear in `village.GET` adult lists. Whether to filter (`WHERE name != '[deleted]'`) is a separate UX/observability question — flag, do not fix here. Same applies to `notifications` recipient resolution: `lib/notify.ts` already uses `users.email` and notification-pref columns; an anonymized row's email becomes `deleted+<uuid>@homestead.app` and `pushSubscriptions` cascade-deleted means push fan-out naturally skips them; an L16-batch concern, not B3.
- L8 typed-error helper migration. The 4xx path here returns 409 if we ever surface `has_history` to the caller (we don't — see Pressure-test §6); not a new error class.
- Account-deletion concurrency tail (data-integrity F1's "multi-step cleanup outside transaction"). Untouched — works today; revisit if this service's tx wrapper surfaces parity issues.

## Conventions

Pattern scan of B3 surface (`lib/` flat layout, `app/api/account/route.ts`, `lib/api-error.ts`, `lib/bell-escalation.ts`, B2 test fixtures):

- **`lib/` layout uses two patterns:** flat domain-named files (`bell-escalation.ts`, `notify.ts`, `push.ts`, `ratelimit.ts`, `strip-exif.ts`, `api-error.ts`) and dir-per-domain (`lib/auth/`, `lib/db/`, `lib/format/`). There is no `lib/services/` and `services/` is not a word that appears in this codebase. The closest precedent is `lib/bell-escalation.ts` — a single-purpose stateless function that wraps a DB-mutating workflow with concurrency safety and notification side-effects. **B3 follows that precedent: `lib/users/tombstone.ts` (dir-per-domain matching `lib/auth/`).** See Pressure-test §1.
- **Anonymization shape (canonical):** `account/route.ts:127-137` writes `name='[deleted]'`, `email='deleted+<row.id>@homestead.app'`, `photoUrl=null`, `clerkUserId='deleted+<row.id>'`. Reuse verbatim — do not invent a new shape. The `clerkUserId` rewrite is what frees the unique constraint `(clerkUserId, householdId)` for a future re-add of the same Clerk identity to the same household.
- **Pre-cleanup ordering (canonical):** `account/route.ts:90-118` does (1) delete `pushSubscriptions`, (2) delete `caregiverUnavailability`, (3) delete pending `familyInvites` for `fromUserId`, (4) `update shifts set claimedByUserId=null where claimedByUserId=row.id`, (5) `update shifts set status='cancelled' where createdByUserId=row.id AND startsAt>=now`. **B3 service replicates steps 4 and 5 only.** Steps 1-3 are unnecessary in B3 because the FKs to `users.id` are `cascade` (`pushSubscriptions`, `caregiverUnavailability`, `bellResponses`, `feedback`) or `cascade` via `fromUserId` (`familyInvites`); the hard-delete branch lets PG cascade do the work, and the anonymize branch leaves them intact (still owned by the now-anonymized row, which is correct per spec NN #16b — "household data persists if other members remain"). See Pressure-test §4.
- **Transaction wrapping:** `account/route.ts` runs the cleanup sequence outside a transaction. The B3 service has fewer steps and an atomic decision point (count → branch → write). Wrap in `db.transaction(async tx => ...)` because the count-then-write is a TOCTOU window; concurrent shift-creation between count and delete would silently lose the `restrict` guarantee. Drizzle supports `db.transaction()` over Neon serverless. See Pressure-test §2.
- **Drizzle dependent-count pattern:** `account/route.ts:123-124` uses `db.$count(table, where)`. Reuse — same import, same shape.
- **Error class location for `instanceof`:** B1 lessons (`docs/lessons.md` 2026-05-02 entry) — error classes checked via `instanceof` belong in the discriminator module, not the thrower. **B3's service does NOT throw a `HasHistoryError` because it never escapes the route layer** (see Pressure-test §6: response shape stays `{ ok: true }`, outcome is logged not surfaced). No new error class is needed. If a future caller wants to branch on outcome, the discriminated return type is the contract.
- **Test mock pattern:** `tests/auth-access-village-authz.test.ts:30-39` is the template — `vi.importActual` for `@/lib/auth/household` plus per-route `requireHousehold`/`requireHouseholdAdmin` overrides. B3 test follows it. The `db` mock at lines 11-19 already includes `transaction: vi.fn()` — B3 tests can stub that to invoke the callback with a tx-shaped object that delegates back to the same mock.
- **Clerk org-membership drop (canonical):** `members/[id]/route.ts:49-63` reads the membership list, finds by `publicUserData.userId === target.clerkUserId`, calls `deleteOrganizationMembership`. Reuse this exact shape in `village/route.ts` DELETE-adult — but **fix the bare `catch {}` to log via `console.error` per Hard Rule #3.** That's a one-line lint of an existing latent bug, justified by the parity work and not a separate refactor.
- **`village/leave` does NOT drop Clerk org membership.** Self-leave is a per-household action; the user remains in the Clerk org until either (a) account-deletion runs, or (b) admin removes them from a different household they're also in. This matches today's `village/leave` behavior and is preserved. See Pressure-test §3 for why.

## File map

- **`lib/users/tombstone.ts` — new file (~80 lines).** Exports:
  ```ts
  type TombstoneOutcome =
    | { kind: 'deleted' }
    | { kind: 'anonymized'; reason: { authoredShifts: number; authoredBells: number } };
  export async function tombstoneUser(args: { userId: string; householdId: string }): Promise<TombstoneOutcome>;
  ```
  Wraps the count → cancel-future-shifts → null-claimed → delete-or-anonymize sequence in `db.transaction`. The `householdId` arg is a safety-belt scope — the service refuses to operate on a `(userId, householdId)` pair that doesn't exist (returns no-op or throws — see Pressure-test §7) — to prevent a multi-household caregiver in household A from being tombstoned via a request that thinks it's acting on household B. Importantly, the service operates on the `users.id` (the per-household row's PK), not `clerkUserId`, so multi-household scoping is structural, not paranoid; the `householdId` arg is a redundant assertion.

- **`app/api/village/leave/route.ts` — edit.** Line 20 swap: `db.delete(users)...` becomes `await tombstoneUser({ userId: user.id, householdId: household.id })`. Response stays `{ ok: true }`. Outcome logged at `console.log` (or `apiError`-style structured log) for ops visibility.

- **`app/api/village/route.ts` — edit (DELETE branch only, line 98).** Adult branch swap: same as above. Then add Clerk org-membership drop mirroring `members/[id]/route.ts:49-63` — read memberships, find by target `clerkUserId`, delete. **Important:** the B3 service operates on `users.id`, but the Clerk drop needs the target row's `clerkUserId` — so the route must `db.select` the target row before calling the service (currently it does not — it deletes by `(id, householdId)` predicate without reading first). This is a one-extra-query change; the service-call ordering is: (1) select target row, (2) call service, (3) drop Clerk membership if Clerk ID resolvable. If service returns `kind: 'anonymized'`, the Clerk drop still runs — anonymization keeps the row in the household but membership in the Clerk org is the wrong state for a removed caregiver.

  **Wait — this needs a pressure-test.** If the row is anonymized (history exists) AND the Clerk membership is dropped, the surviving anonymized row in the household has a `clerkUserId` rewritten to `deleted+<uuid>` — so the drop must happen on the *original* `clerkUserId` (read pre-tombstone). And on next sign-in by that Clerk identity, the unique `(clerkUserId, householdId)` is now free so they could be re-invited cleanly. See Pressure-test §8.

- **`app/api/household/members/[id]/route.ts` — edit (DELETE only, line 47).** Same swap. Already does the Clerk-membership drop at lines 49-63; **fix the bare `catch {}` at line 61 to `catch (err) { console.error('[household:member:DELETE:clerk]', err) }`** per Hard Rule #3 — a one-line lint piggybacking on the parity work, justified because B3 is establishing the canonical pattern that village DELETE-adult will copy.

- **`tests/user-tombstone.test.ts` — new file.** Two describe blocks:
  1. **Service unit tests (no route coupling):** mock `db.transaction`, `db.$count`, `db.update`, `db.delete`. Cases: (a) zero history → returns `{ kind: 'deleted' }`, calls `db.delete(users)`; (b) 1 authored shift → returns `{ kind: 'anonymized', reason: { authoredShifts: 1, authoredBells: 0 } }`, calls `db.update(users)` with the canonical `[deleted]` payload, does NOT call `db.delete(users)`; (c) 1 authored bell → same, but `authoredBells: 1`; (d) future shifts → assert the cancel-future-shifts UPDATE fires before the count→branch; (e) `claimedByUserId` references → assert null-out runs before delete.
  2. **Route integration regression (covers L9 + B2 SHIPLOG follow-up):** for each of the three caller routes, seed an authoring user, call DELETE/POST, assert (i) response is 200 `{ ok: true }`, (ii) no 5xx ever, (iii) related shift/bell rows survive, (iv) for the two admin paths, assert `clerkClient.organizations.deleteOrganizationMembership` is called with the *original* `clerkUserId` and `clerkOrgId`, (v) for `village/leave`, assert Clerk drop is NOT called.

- **`tests/auth-access-village-authz.test.ts` — fixture amendment, not new logic.** Line 233 currently asserts `expect(await res.json()).toEqual({ ok: true })` for `village/leave`. **No change needed — B3 keeps the response shape `{ ok: true }`** (per Pressure-test §6 — outcome logged not surfaced). Fixture amendment is limited to: the `db.transaction` mock at lines 11-19 already exists; the `db.$count` mock already exists; the `db.update`/`db.delete` mocks may need additional stubbed return values for the new service path. ~5-line touch in the test setup, no assertion changes. **Scope addendum:** if running the existing test suite after the route swap reveals B2 tests are red because the new service-internal `db.$count` call has no stub, add the stubs in the same PR. Same shape as B1's `tests/admin-transfer.test.ts` mock update and B2's `tests/village-post.test.ts` `isAdmin: true` fixture — kept in B3 because the route migration would otherwise leave a regression-test gap.

- **`SHIPLOG.md` — entry on merge** (autonomous per Protos §"Capture", written after PR merges).

## Graveyard

(empty — entries dated when added)

## Anchors

- `app/api/account/route.ts:127-137` is the canonical `[deleted]` tombstone shape per spec NN #16b. Do not invent a new placeholder. Service's anonymize branch matches this verbatim.
- `app/api/account/route.ts:111-118` is the canonical "cancel future shifts" pattern. Service's pre-cleanup matches.
- `app/api/account/route.ts:105-106` is the canonical "null out claimed shifts" pattern. Service's pre-cleanup matches.
- `members/[id]/route.ts:49-63` is the canonical Clerk org-membership drop pattern (modulo the `catch {}` lint). `village/route.ts` DELETE-adult copies it.
- `village/leave/route.ts` post-B3 still does NOT drop Clerk org membership. Self-leave from a single household is not the same as account deletion; the user retains their Clerk identity for any other household they belong to. (Pressure-test §3.)
- B1's `requireHouseholdAdmin()` and B2's `requireHousehold()` callers remain canonical for the gates. B3 does not touch the auth helpers.
- `lib/db/schema.ts` `shifts.createdByUserId` and `bells.createdByUserId` `ON DELETE restrict` is the data-integrity guarantee that authored history cannot be silently lost. Do not weaken to `set null` or `cascade`. (Anchor preserved from the previous B3 scaffold.)
- After B3: `lib/users/tombstone.ts` is the canonical user-removal helper for per-household removals. `db.delete(users)` survives only in `lib/users/tombstone.ts` (the hard-delete branch) and `app/api/account/route.ts:127` (deferred migration — Pressure-test §5).
- After B3: admin village-DELETE-adult and admin members/[id]-DELETE both drop Clerk org membership; caregiver self-leave does not.

## Fragile areas

1. **`lib/auth/household.ts` — same blast-radius warning as B1/B2.** B3 does NOT modify this file. Scope-creep interrupt fires if a fix attempt starts touching it.
2. **`account/route.ts` — deferred migration, untouched in B3.** It owns its own Clerk-user deletion (not membership drop) and its own multi-household loop. Migrating it requires the service to either (a) accept `householdId: null` to mean "all rows for this clerkUserId" — which conflicts with the per-household scoping safety belt, or (b) be called in a loop by `account/route.ts` — which works but introduces parity-vs-refactor risk inside an already-correct path. Defer to a follow-up PR after B3 ships and the service has soak time. (Pressure-test §5.)
3. **TOCTOU between count and delete.** A concurrent `INSERT INTO shifts (createdByUserId=...)` between the `$count` and the `db.delete(users)` would re-introduce the FK-restrict 5xx — except the service runs inside `db.transaction`, which under PG default isolation (READ COMMITTED) still does NOT serialize between transactions. The `restrict` constraint is the actual safety belt — if a concurrent shift sneaks in mid-tx, the FK violation surfaces as an `error` from `db.delete`, which the service must catch and downgrade to the anonymize branch. **Service must `try { db.delete } catch (FK violation) { fall through to anonymize }`.** Pressure-test §2 elaborates.
4. **Anonymized rows still surface in `village.GET`.** A removed-with-history caregiver appears as `[deleted]` in adult lists. UX-acceptable for v1 (matches account-deletion behavior on the spec) but worth a UI follow-up to suppress them from the village screen rendering. Not B3 scope.
5. **`feedback.userId`** — schema.ts:130, `cascade`. On hard delete, feedback rows are gone (matches spec for account deletion). On anonymize, they're preserved with the now-anonymized author. Spec is silent; current `account/route.ts` behavior matches (it never deletes feedback explicitly; cascade handles delete branch, anonymize keeps them). B3 inherits this — no change.
6. **B2 SHIPLOG `village/leave` test fixture** — only asserts `{ ok: true }`. Keeping that response shape (per Pressure-test §6) means no test churn here. If a future B-batch wants to surface outcome to clients, that's a fixture amendment in that batch, not B3.

## Pressure-tested decisions (Protos §"Plan-reviewer" requirements)

These are the explicit pressure-tests the user requested. Each is on the page so the spec-reviewer can see the reasoning, not just the conclusion.

### §1 — Service location: `lib/users/tombstone.ts` vs `lib/services/member-tombstone.ts` vs flat `lib/user-tombstone.ts`

Surveyed `lib/`: flat domain-named files (`bell-escalation.ts`, `notify.ts`, `push.ts`, `ratelimit.ts`, `strip-exif.ts`, `api-error.ts`, `format.ts`, `copy.ts`) and dir-per-domain (`lib/auth/`, `lib/db/`, `lib/format/`). **There is no `lib/services/`** and no file containing the word "services" in this codebase. Introducing `lib/services/` is an architectural concept import — it'd be the first one and would set a new layout pattern by accident.

`lib/users/tombstone.ts` matches `lib/auth/`'s dir-per-domain shape. `lib/auth/` exists because there are multiple auth concerns (`household.ts` plus future helpers). `lib/users/` is forward-compatible: a future `lib/users/provisioning.ts` (refactor of `requireHousehold()`'s first-user provision logic) or `lib/users/multi-household.ts` (helpers for the multi-household identity rules) would slot in cleanly. Flat `lib/user-tombstone.ts` matches `bell-escalation.ts` exactly but is harder to grow.

**Decision: `lib/users/tombstone.ts`.** Push back welcomed if the user prefers flat — `lib/user-tombstone.ts` is a one-liner change.

### §2 — Service shape: single function vs multiple. Throws vs returns discriminated outcome.

Single function: `tombstoneUser({ userId, householdId })`. The work is one decision (history? → branch). A caller that wanted just the count or just the anonymize would be a YAGNI case.

Inputs/outputs: takes a `(userId, householdId)` pair (the per-household row's PK plus the scope safety belt — see Pressure-test §7). Returns the discriminated outcome `{ kind: 'deleted' } | { kind: 'anonymized', reason: { authoredShifts, authoredBells } }`.

**Throws or returns?** Returns. Reasons:
- The B1 lesson on `instanceof` says error classes belong in the discriminator. The discriminator here is the route. The route doesn't need to discriminate — both outcomes are 200 (Pressure-test §6). A throw would force the route to catch and translate; returning a tagged union is a simpler contract.
- The `try/catch (FK violation) { fall through to anonymize }` inside the service (Fragile area §3) is an internal recovery, not a thrown signal to the caller. The caller never sees the FK error.
- The service does throw on TRULY exceptional conditions (DB connection lost, schema drift) — those are unhandled errors that bubble to the route's `authError`. That's the same pattern `requireHousehold()` uses today.

### §3 — Clerk side-effects: which caller owns each call, and why the service does NOT own them.

Three Clerk surfaces in the L9 region:
- `account/route.ts` deletes the Clerk user (`client.users.deleteUser`). That's account-wide.
- `members/[id]/route.ts` deletes the org membership only. The Clerk identity survives.
- `village/leave/route.ts` does nothing to Clerk. The identity AND the org membership survive.
- `village/route.ts` (post-B3) deletes the org membership only — parity with `members/[id]`.

Why service doesn't own: each caller's relationship to Clerk is different. `account` deletes the user; `members/[id]` and `village/route.ts` delete a specific org membership; `village/leave` does nothing. If the service accepted a `clerkSideEffect` arg, it'd be a switch statement that's clearer at the route level. Routes already know their semantics; the service doesn't need to learn them.

The service's job is "make the DB row safe to remove given FK restrict." Clerk is orthogonal.

### §4 — Pre-cleanup: which steps from `account/route.ts` does the service replicate?

`account/route.ts:90-118`:
1. Delete `pushSubscriptions` for the row → **service skips.** FK is `cascade`; PG handles it on hard-delete branch. Anonymize branch leaves them; on next sign-in by the (now-deleted-from-Clerk) identity they'd be re-created — but this is the village/membership flow, not account-deletion, so the Clerk identity survives and the existing `pushSubscriptions` rows still belong to that identity-in-this-household. UNLESS the row is anonymized — anonymized rows shouldn't keep push subs because the user is no longer in the household and notifications would target a removed-but-anonymized row. **Reconsidered: the service should delete `pushSubscriptions` for this `users.id` on the anonymize branch.** Hard delete: PG cascade. Anonymize: explicit `db.delete(pushSubscriptions).where(eq(userId, row.id))`.
2. Delete `caregiverUnavailability` → same logic. PG cascade on hard delete; explicit on anonymize. (Anonymized member's stale availability windows shouldn't gate other members' work.)
3. Delete pending `familyInvites` for `fromUserId` → **skip on both branches.** The invites' `fromUserId` is `cascade`; PG handles delete. Anonymize: invites become orphan-pointed at an anonymized author, but pending invites by a removed member are stale anyway and the cleanup is `account/route.ts`'s job for self-deletion. For per-household removal, anonymizing keeps invite history attributable to the (anonymized) member; that's correct.
4. `update shifts set claimedByUserId=null where claimedByUserId=row.id` → **service includes** — runs before the count, on both branches.
5. `update shifts set status='cancelled' where createdByUserId=row.id AND startsAt>=now` → **service includes** — runs before the count, on both branches. After this, the count is the "past + current" authored set.

Updated pre-cleanup sequence in service:
1. Null `claimedByUserId` references.
2. Cancel future-authored shifts.
3. Count remaining authored shifts (now: past + currently-running) and authored bells (regardless of state — the FK restrict is on the column, not on a status).
4. If both zero → delete `pushSubscriptions`/`caregiverUnavailability` is cascaded by PG; `db.delete(users)`. Done.
5. Else → explicit `db.delete(pushSubscriptions)`, `db.delete(caregiverUnavailability)`, then `db.update(users)` with the canonical anonymize payload. Done.

This is more steps than the original B3 scaffold's spec but it's what parity with `account/route.ts` actually requires for anonymize correctness. Surface to user before Build.

### §5 — Migration of `account/route.ts` to the service: defer.

Reasons:
- `account/route.ts` operates over multiple `users` rows in a `for` loop (multi-household identity). The service operates on one `(userId, householdId)` pair. Migrating means the route either (a) loops calling the service, or (b) the service grows a "for all rows for this clerkUserId" mode that conflicts with the safety belt.
- `account/route.ts` owns the Clerk user deletion (not membership drop), which the service explicitly doesn't own (Pressure-test §3).
- `account/route.ts` is already correct. Migrating it is a parity exercise with no behavior change. The risk of regressing a correct path > the cleanup value.

**Deferred to follow-up PR.** Until then, `db.delete(users)` survives in two places: the new service (the hard-delete branch) and `account/route.ts:127`. The done-criteria grep is scoped accordingly.

### §6 — Whether to fold "village DELETE doesn't drop Clerk membership" into B3 or defer. Default: fold in.

Folded in. Reasons:
- The bug (asymmetric Clerk state on adult removal) lives at the same line being touched (`village/route.ts:98`).
- Fixing FK-safety without fixing membership drop ships a half-fix: the row is gone (or anonymized), but the user can re-enter on next sign-in via Clerk org membership.
- Parity with `members/[id]/route.ts` is what the SHIPLOG follow-up identified.
- Pulling the membership drop into `members/[id]` was already the canonical pattern; copying it to `village/route.ts` is a 14-line transcription, not new design.
- B3 also includes the bare-`catch {}` lint (Hard Rule #3) on `members/[id]:61` because we're establishing the canonical pattern by transcription; the source of the transcription must be sound.

### §7 — `(userId, householdId)` safety belt: arg shape and what happens on mismatch.

The service signature is `tombstoneUser({ userId, householdId })`. Both args are required.

The service's first DB read inside the transaction is `SELECT ... FROM users WHERE id=$1 AND householdId=$2 LIMIT 1`. If no row → return early with `{ kind: 'deleted' }` (idempotent — the row is already gone) AND emit a structured warn log (`tombstone: no-op, row not found`). Routes treat this as success.

This is a redundant assertion on top of structural scoping (`users.id` is already per-household), but it (a) prevents a multi-household edge case where a route resolves the wrong row (e.g., a future `village/leave` bug that resolves caller's row from the wrong household context) from silently tombstoning the wrong row, and (b) makes the service callable from non-route contexts (cron, admin tools) without a scoping surprise.

### §8 — Order of Clerk membership drop vs service call in `village/route.ts` DELETE-adult.

Tricky because anonymization rewrites `clerkUserId` to `deleted+<uuid>`, so the Clerk drop must use the *original* value. Two acceptable orders:

(a) **Read target row → drop Clerk membership → call service.** Clerk membership is removed first (using the live `clerkUserId`), then the DB cleanup happens. Failure mode: if the service throws (e.g., DB connection lost mid-tx), the user is in a bad state — Clerk membership gone but DB row still present. They can't re-enter the household via Clerk re-invite cleanly because the unique constraint `(clerkUserId, householdId)` is still occupied.

(b) **Read target row → call service → drop Clerk membership using the cached `clerkUserId`.** DB-first, Clerk-last. Matches BUILD-LESSONS Principle 6: "Auth provider deletion runs last in account deletion. DB cleanup first, then `deleteUser()` on the auth provider. If DB throws, you don't orphan a live login with no data." Failure mode: DB row gone/anonymized but Clerk membership survives — user can sign back in to the org and the requireHousehold provisioning at `lib/auth/household.ts:43-58` would create a fresh `users` row. That's the Clerk-first failure mode of `account/route.ts` lessons-learned exactly.

Wait — for `account/route.ts` the principle is correct because the user is being deleted entirely. For `village/route.ts` removing one membership while the user has other households, the Clerk-membership drop is the equivalent of a bounded `deleteUser` and the same logic applies: DB first, Clerk last. If the Clerk drop fails after DB succeeds, log it and return success with a `clerkDropped: false` flag (mirroring `account/route.ts:148-156`). The user might re-enter the household on next sign-in but that's a recoverable warning, not a data-loss event.

**Decision: order (b). DB first, Clerk last. Log Clerk failure but return 200 to the caller.** Matches `account/route.ts` and BUILD-LESSONS Principle 6. Caches `target.clerkUserId` from the pre-service `db.select` so the post-service Clerk call has the original value.

### Plan-file naming

User prompt asked for `docs/plans/launch-audit-fix-batch-03-member-tombstone.md`. A scaffold already exists at `docs/plans/launch-audit-fix-batch-03-soft-delete-fk.md` and is referenced from `docs/plans/launch-audit-2026-05-02/fix-sequence.md:22`. **Decision: rebuild in place at the existing filename** to avoid ledger churn and keep the audit→batch crosswalk intact. Surfacing this for user override — happy to rename if preferred.

## Regression tests required (Hard Rule #6)

- `tests/user-tombstone.test.ts` — service unit tests + route integration regression (5 service cases + 3 route cases per §"File map"). Exercises: zero-history hard delete; history → anonymize with canonical payload; pre-cleanup ordering (claimedByUserId nulled, future shifts cancelled); FK race fallback to anonymize; per-route 200 / no 5xx / row survival / Clerk-drop parity.

Verification gate before declaring B3 done: `grep -rn "db.delete(users)" app/api/ lib/` returns matches **only** in `lib/users/tombstone.ts` and `app/api/account/route.ts:127` (the deferred migration). Anything else is a regression.

## Stretch / non-blocking

- Filter `[deleted]` rows from `village.GET` adult lists. UX cleanup, not data-integrity. Defer to a UI batch.
- Tombstone-aware notification recipient resolution in `lib/notify.ts`. Likely already correct via `pushSubscriptions` cleanup on the anonymize branch (Pressure-test §4 update), but worth a sweep in the L16 batch.
- Migrate `account/route.ts:127` to the service. Pressure-test §5 deferral.
