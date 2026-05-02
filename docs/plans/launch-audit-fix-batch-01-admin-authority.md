---
title: Launch fix batch 01 — Admin authority foundation
date: 2026-05-02
status: pending
governs: L4
parent-audit: docs/plans/launch-audit-2026-05-02/synthesis.md
batch-id: B1
prereqs: none
unblocks: B2
---

## Spec

A single server-side helper `requireHouseholdAdmin()` is the only path used to authorize household-administration writes. The helper re-reads the caller's `users` row inside the active household and returns 403 (`{ error: 'no_access' }`) unless `users.isAdmin === true`. Every household administration route — household profile PATCH, member PATCH/DELETE, admin transfer, village CRUD, village invite — is migrated to this helper. After this batch lands, `app/api/household/admin/route.ts` and the migrated routes share one falsifiable authorization contract.

**Done criteria:** `grep -rn "user.role !== 'parent'" app/api/` returns no matches in admin-gated routes; new helper exists; unit test asserts the matrix (parent without `isAdmin` = 403; admin = 200) across the migrated routes.

**Out of scope:** L2 village CRUD body-validation cleanup (B2); L3 Clerk role-metadata allowlist (B2); L5 notification-preferences identity scoping (B2).

## Conventions

Pattern scan of the seed routes (`lib/auth/household.ts`, `lib/api-error.ts`, `app/api/household/admin/route.ts`):
- Auth helper `requireHousehold()` returns `{ household, user }` and throws on failure; `authError(err, 'tag')` converts to a uniform 401/403/409 response via `lib/api-error.ts`.
- The current admin route reads `users.isAdmin` from the `user` returned by `requireHousehold()` (line 31) and returns its own ad hoc `{ error: 'Only the household admin can ...' }` instead of `no_access`. New helper must use `forbidden()` once that helper exists (see B9, L8).
- All admin-gated routes already accept the `user` parameter from `requireHousehold()`; migration is purely the gate, not a re-fetch.

## File map

- `lib/auth/household.ts` — add `requireHouseholdAdmin()`. Wraps `requireHousehold()` and throws a typed `NotAdminError` if `!user.isAdmin`. Returns `{ household, user }`.
- `lib/api-error.ts` — extend to handle `NotAdminError` → 403 `{ error: 'no_access' }`.
- `app/api/household/admin/route.ts` — replace inline `isAdmin` check with `requireHouseholdAdmin()`.
- `app/api/household/route.ts` (PATCH at line 76) — gate via `requireHouseholdAdmin()`.
- `app/api/household/members/[id]/route.ts` (PATCH at line 12, DELETE at line 42) — replace `user.role !== 'parent'` with `requireHouseholdAdmin()`.
- `tests/auth-access-household-admin.test.ts` — new file (regression test for L4 / synthesis).

## Graveyard

(empty — entries dated when added)

## Anchors

- `app/api/household/admin/route.ts` correctly gates on `users.isAdmin` today — this batch generalizes that contract; do not regress it.
- `lib/auth/household.ts` `requireHousehold()` already centralizes Clerk + DB + per-household-identity creation; do not duplicate that work in the new helper.
- `account/route.ts` self-deletion does not require admin (a user deleting their own account is allowed without admin) — admin helper is for *other-row* mutations.

## Fragile areas

- `lib/auth/household.ts` — flagged in `homestead-app/CLAUDE.md` as the highest-blast-radius file (12+ importers). Keep the new function additive; do not refactor `requireHousehold()` in this batch.
- Clerk `app_role` vs. DB `users.isAdmin` are separate. The helper must read `users.isAdmin` (DB), not Clerk metadata, because Clerk metadata is mutable from L3-style holes.

## Regression tests required (Hard Rule #6)

- `tests/auth-access-household-admin.test.ts` — assert: parent with `isAdmin=false` PATCH/DELETE on `/api/household/members/[id]` returns 403 `{ error: 'no_access' }`; admin succeeds; non-member returns 403; unauthenticated returns 401 `not_signed_in`. Cover household profile PATCH and admin transfer in the same matrix.
