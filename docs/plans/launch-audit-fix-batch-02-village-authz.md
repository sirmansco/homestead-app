---
title: Launch fix batch 02 — Village authz + invite role allowlist + notification per-household scoping
date: 2026-05-02
status: pending
governs: L2, L3, L5
parent-audit: docs/plans/launch-audit-2026-05-02/synthesis.md
batch-id: B2
prereqs: B1 (`requireHouseholdAdmin()` helper merged in #43 / sha 062a245)
unblocks: B3+ (Theme A continuation), and indirectly L9 (member tombstone)
---

## Spec

This batch closes three blocks-launch / should-fix findings on the same code surface (village + invite + notifications). Each finding has a different fix shape; they share this file because they touch overlapping routes and the per-household-identity invariant ties them together.

**L2 — Village CRUD admin gate (blocks-launch).** `app/api/village/route.ts` POST (creates kid or adult) and DELETE (removes kid or adult by id+type) currently call `requireHousehold()` and never check admin authority. Migrate both to `requireHouseholdAdmin()` (the B1 helper). The DELETE path's tombstone behavior for `users` rows with authored history is **L9 (synthesis Theme B), out of scope here** — B2 only changes the gate. After B2, DELETE on a `users` row that has authored shifts/bells will still 5xx via FK restrict; that's the same defect that exists today, scoped for a separate B3+ fix. We do not regress L9 behavior.

**L3 — Village invite role allowlist (blocks-launch).** `app/api/village/invite/route.ts:7` calls `requireHousehold()` (line 7) but never gates on admin. Routes through Clerk `createOrganizationInvitation` (line 33) with caller-supplied `appRole` and `villageGroup` in `publicMetadata` (line 38). Two coupled defects: (a) no admin gate on the invite write path, (b) the role/villageGroup values are accepted from the client without an allowlist check (free-text could be inserted into Clerk metadata, then bleed back through `requireHousehold()` first-user provisioning at `lib/auth/household.ts:43-47`). Fix (a) by switching to `requireHouseholdAdmin()`. Fix (b) by validating `role ∈ {parent, caregiver}` and `villageGroup ∈ {covey, field}` against an explicit allowlist before passing to Clerk. Reject anything else with 400.

**L5 — Notification preferences identity scoping (should-fix).** Spec at `Apps/Homestead/docs/specs/homestead.md:50,95,169,218` is unambiguous: "notification prefs are per-household." `app/api/notifications/route.ts:80` violates this — `db.update(users).set(patch).where(eq(users.clerkUserId, userId))` bulk-updates every `users` row sharing the Clerk identity. A multi-household caregiver toggling prefs from household A silently flips prefs in household B. Fix: bind to the **active household** via `requireHousehold()` (which already resolves `(clerkUserId, householdId)`) and update only that one row. GET also returns prefs from the active household, not "the first row" (`route.ts:43-44`). Synthesis L5 framed the spec direction as undecided — it isn't. The spec already decided: per-household.

**Done criteria:**
- `grep -rn "user.role !== 'parent'" app/api/` still returns no matches (B1 anchor preserved).
- `app/api/village/route.ts` POST and DELETE use `requireHouseholdAdmin()`.
- `app/api/village/leave/route.ts` exists; uses `requireHousehold()` (not admin); operates only on `(user.id, household.id)`.
- `ScreenCircle.tsx` `onLeave` handler calls `POST /api/village/leave`.
- `app/api/village/invite/route.ts` POST uses `requireHouseholdAdmin()` AND validates role/villageGroup against `{parent,caregiver}` / `{covey,field}` allowlists; non-allowlisted values return 400 before any Clerk call.
- `app/api/notifications/route.ts` GET and PATCH bind to the active household via `requireHousehold()`; PATCH affects exactly one `users` row.
- New regression test asserts: (1) non-admin POST/DELETE on village → 403 `no_access`, admin → 200; (2) caregiver self-leave via POST `/api/village/leave` → 200 (no admin required); (3) non-admin invite → 403, admin with bad role → 400, admin with good role → Clerk invite path; (4) PATCH `/api/notifications` on a multi-household user only updates the active household's row.

**Out of scope:**
- L9 (member/village hard-delete tombstone). DELETE on `users` rows with authored history will continue to 5xx via FK restrict — same as today, no regression. Separate batch.
- L1 (`/api/village/invite-family/accept` anonymous GET-mutation). Theme C, separate batch.
- L8 (uniform auth-error helpers). The free-text errors in this batch's routes already collapse to `authError()`'s canonical `no_access`/`not_signed_in`/`no_household` because `requireHouseholdAdmin()` throws the typed errors. No new helpers added in B2.
- L7 (multi-household unavailability scoping). Same per-household-identity theme, different route, different fix shape.

## Conventions

Pattern scan of B2 surface (`app/api/village/route.ts`, `app/api/village/invite/route.ts`, `app/api/notifications/route.ts`, `lib/auth/household.ts`, `lib/api-error.ts`):

- **Auth helpers (post-B1):** `requireHousehold()` returns `{ household, user, userId, orgId }`; `requireHouseholdAdmin()` wraps it and throws `NotAdminError` (mapped to 403 `no_access`). `authError(err, 'tag')` is the canonical catch-handler.
- **Free-text errors are still the default in B2 surface routes** — village POST returns `'Name required'`/`'Unknown type'`, notifications returns `'No valid preference fields supplied'`. Per spec NN #6 these should converge to typed helpers (L8 batch). B2 does not introduce new free-text errors but does not migrate existing ones either.
- **Rate limiting on invite is via dynamic import** (`route.ts:10`). Keep that — it's the established pattern for code-splitting the rate limiter off the hot path.
- **Clerk metadata write boundary** is `app/api/village/invite/route.ts:38` and `lib/auth/household.ts:52-58`. Anything that writes to `publicMetadata.appRole` / `publicMetadata.villageGroup` must be allowlist-gated; the `requireHousehold()` first-user provisioning reads it back and inserts into the DB.
- **Notification-pref shape** is five `boolean` columns on `users` (`schema.ts:30-34`) defaulting to `true` (opt-out model). Do not introduce new pref keys in B2.
- **UI callers of B2 routes** are limited and known: `app/components/ScreenSettings.tsx:92,110` (notifications), `app/components/ScreenCircle.tsx:314,341,724,856` (village + invite). Behavior changes must remain compatible with these call sites.

## File map

- `app/api/village/route.ts` — POST (line 48) and DELETE (line 87) replace `requireHousehold()` with `requireHouseholdAdmin()`. GET stays on `requireHousehold()` (read path; no admin needed). Surface change is one import + two call sites. **Scope addendum (2026-05-02):** the previous DELETE handler served two semantically distinct operations — "admin removes another row" and "caregiver leaves a household." Splitting them: village DELETE is now admin-only (other-row mutation); a new `app/api/village/leave/route.ts` handles caregiver self-removal. Keeps the authorization contract falsifiable per-endpoint and gives L9 (tombstone) a clean home.
- `app/api/village/leave/route.ts` — **new file.** `POST` route for caregiver self-removal from the active household. Calls `requireHousehold()` (not admin), then deletes the caller's own `users` row scoped to `(user.id, household.id)`. Returns `{ ok: true }`. Same FK-restrict caveat as today's village DELETE: caregivers with authored shifts/bells will 5xx until L9 ships. The endpoint is shaped for L9 to add tombstone behavior in one place rather than threaded through the conflated DELETE.
- `app/components/ScreenCircle.tsx` — **edit required (was read-only check).** `onLeave` handler at line 724 swaps from `DELETE /api/village?id={myRow.id}&type=adult` to `POST /api/village/leave`. ~4-line change.
- `tests/village-post.test.ts` — **fixture amendment.** `USER_ROW` gains `isAdmin: true` because village POST is now admin-gated and the existing tests exercise an admin caller. Same scope-creep shape as B1's `tests/admin-transfer.test.ts` mock update — kept in B2 because the route migration would otherwise leave a regression-test gap (Hard Rule #6).
- `app/api/village/invite/route.ts` — POST (line 5) replaces `requireHousehold()` with `requireHouseholdAdmin()`. Adds explicit allowlist validation block immediately after body parse: `if (!['parent','caregiver'].includes(role)) return 400`; `if (!['covey','field'].includes(villageGroup)) return 400`. Returns 400 before any Clerk call.
- `app/api/notifications/route.ts` — both GET (line 23) and PATCH (line 63) replace `requireUser()` with `requireHousehold()`. GET returns prefs from the active household's row only (no "first row" fallback). PATCH's WHERE narrows from `eq(users.clerkUserId, userId)` to `and(eq(users.clerkUserId, userId), eq(users.householdId, household.id))`. Updates exactly one row.
- `tests/auth-access-village-authz.test.ts` — new file. Four describe blocks mirroring B1's matrix shape: village POST/DELETE admin-only matrix; village leave (POST `/api/village/leave`) — caregiver self-removal works without admin; invite POST matrix (admin/non-admin × good-role/bad-role); notifications GET+PATCH on multi-household identity.
- `app/components/ScreenSettings.tsx` — **read-only check.** GET response shape stays `{ prefs: { … } | null }`; no client change required. Confirm in plan review; do not edit unless verification reveals a break.
- `app/components/ScreenCircle.tsx` — **read-only check.** Existing 403 handling on `/api/village` POST/DELETE/invite calls must already render gracefully (they did under B1 for `/api/household`). Confirm error-rendering paths exist; do not edit unless verification reveals a break.

## Graveyard

(empty — entries dated when added)

## Anchors

- B1's helper `requireHouseholdAdmin()` is canonical. Do not duplicate the gate in B2 routes; call the helper.
- `NotAdminError` lives in `lib/api-error.ts` (B1 lessons entry). Do not re-locate.
- `requireHousehold()` already centralizes Clerk + DB resolution. Do not re-fetch the active `users` row in notifications PATCH — read it from `requireHousehold()`'s return.
- The five notification-pref columns and their `default: true` (opt-out model) are the spec contract (`docs/specs/homestead.md:188` "no engagement-bait notifications" + the existing column defaults). Do not change defaults; do not add prefs.
- `app/api/account/route.ts:90-140` already proves the tombstone pattern for users with authored history (`name='[deleted]'`, `clerkUserId='deleted+<uuid>'`). B2 does not implement tombstone here — but the village DELETE flow must not break that established pattern by, e.g., changing FK behavior. Just add the gate.
- The dynamic-import rate-limit pattern at `village/invite/route.ts:10-13` runs **after** auth resolves. Order matters — `requireHouseholdAdmin()` throws on non-admin before rate-limit cost is paid.
- After B2: village DELETE is admin-only (other-row); village leave (`POST /api/village/leave`) is the caregiver self-removal path. Two endpoints, two falsifiable contracts. L9 (tombstone) lands in `village/leave/route.ts` first because that's where authored-history retention matters most.

## Fragile areas

1. **`lib/auth/household.ts` — same blast-radius warning as B1.** B2 does NOT modify this file; if a fix attempt starts touching it, scope-creep interrupt fires.
2. **Clerk metadata bleeds back through `requireHousehold()` provisioning.** Lines 43-58 of `lib/auth/household.ts` read `publicMetadata.appRole` and `publicMetadata.villageGroup` from Clerk and insert directly into the DB. The L3 allowlist must be enforced at the **write boundary** (`village/invite/route.ts`); however, a long-tail risk remains for any other code path that writes to Clerk metadata. Audit: only `app/api/village/invite/route.ts:38` writes `appRole`/`villageGroup` to Clerk metadata in this codebase (verified by grep before plan finalization).
3. **Notifications GET shape change.** Going from "first row's prefs across all households" to "active household's prefs" is a behavioral change for any multi-household user whose first-row household differs from their active session. The new behavior is correct per spec, but tests that mocked the old shape will need updating. None exist today (no notifications test file in `tests/`).
4. **`ScreenCircle.tsx` POST/DELETE call sites (`route.ts:341, :724, :856`)** assume non-admin caregivers can mutate village state today. Post-B2, those calls will return 403 for non-admins. The UI must already handle 403 gracefully — it does for `/api/household` (B1). Confirm in plan review by reading the error path; if missing, add to File map.

## Regression tests required (Hard Rule #6)

- `tests/auth-access-village-authz.test.ts` — single new test file, three describe blocks:
  1. **Village POST/DELETE matrix** — admin → 200; non-admin → 403 `no_access`; unauthenticated → 401 `not_signed_in`; non-member → 409 `no_household`. Covers both kid and adult create paths.
  2. **Village invite matrix** — admin with allowed role+villageGroup → reaches Clerk path (asserted by mock invocation); admin with `role='owner'` → 400 before Clerk; admin with `villageGroup='inner_circle'` → 400 before Clerk; non-admin → 403, no Clerk call; unauthenticated → 401.
  3. **Notifications scoping** — multi-household identity (two `users` rows for same `clerkUserId`, different `householdId`); PATCH on active household A asserts only A's row is updated, B's row stays at default. GET on active household A returns A's prefs.

Verification gate before declaring B2 done: `grep -rn "requireHousehold" app/api/village/ app/api/notifications/` — every remaining `requireHousehold()` call (without the `Admin` suffix) is on a read-only GET path, justified in code with a one-line comment.

## Stretch / non-blocking

If `ScreenCircle.tsx` does not handle 403 from `/api/village` POST/DELETE/invite cleanly today, B2 adds it. This is the only UI work potentially in scope; if confirmed unnecessary in plan review, drop. Do not preemptively edit.
