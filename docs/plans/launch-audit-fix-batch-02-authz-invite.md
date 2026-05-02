---
title: Launch fix batch 02 — Authz, invite-flow, multi-household scoping
date: 2026-05-02
status: shipped
governs: L1, L2 (authz half), L3, L6, L7
deferred: L5 (notification preferences scope — user direction pending 2026-05-02; opens as separate plan once decided)
parent-audit: docs/plans/launch-audit-2026-05-02/synthesis.md
batch-id: B2
prereqs: B1 (requireHouseholdAdmin helper)
unblocks: B3
---

## Spec

After this batch, no household-admin write surface is reachable without `requireHouseholdAdmin()`; the family-invite accept flow has split GET-preview from POST-consume; shift claim respects role and `preferredCaregiverId`; multi-household identity scoping is correct for unavailability and notification preferences. Specifically:

1. **L1** — `GET /api/village/invite-family/accept` becomes side-effect-free token preview (no DB write). New `POST /api/village/invite-family/accept` (authenticated) consumes the token, binding the signed-in Clerk user to the invited email or new household.
2. **L2 (authz half)** — `app/api/village/route.ts` POST and DELETE gate on `requireHouseholdAdmin()`. (FK-safety half deferred to B3.)
3. **L3** — `app/api/village/invite/route.ts` POST gates on `requireHouseholdAdmin()`. Caller-supplied `role` and `villageGroup` constrained to a fixed allowlist that the helper authorizes.
4. **L5 — DEFERRED.** User direction "not sure" on 2026-05-02. This batch does not modify `app/api/notifications/route.ts`. Open a separate plan once scope (Clerk-identity vs. `(clerkUserId, householdId)`) is decided. Removing L5 does not block any other L# in this batch.
5. **L6** — `POST /api/shifts/[id]/claim` resolves caller's `users` row in the shift's household. **Decision locked 2026-05-02: caregivers only.** Requires `role === 'caregiver'` unconditionally; parents cannot claim shifts even in their own household. Includes `(preferredCaregiverId IS NULL OR preferredCaregiverId = caller.id)` in the atomic update predicate.
6. **L7** — `app/api/unavailability/route.ts` becomes household-scoped. Require active org / `householdId`; resolve `(clerkUserId, householdId)` row; reject if not present.

**Done criteria:** Each L# above has a regression test. `grep -rn "requireHousehold()" app/api/village` shows the routes use the admin helper. Unauthenticated GET to invite-family/accept does not change `familyInvites.status`.

**Out of scope:** UI changes for new POST endpoint (separate ticket); FK-restrict 5xx fix on village delete (B3); error-key uniformity migration (B9).

## Conventions

Pattern scan (B1 just landed; routes that use `requireHouseholdAdmin()` show the pattern):
- Helper signature: `requireHouseholdAdmin(): Promise<{ household, user }>`. Throw → `authError(err, 'tag')`.
- Atomic updates use Drizzle's `db.update(...).set(...).where(and(...))`. Predicate composition pattern is consistent across the codebase — keep it.
- The route file at `app/api/household/admin/route.ts` post-B1 is the canonical example of the migrated pattern.
- For new POST endpoint at `app/api/village/invite-family/accept`: handler exports `POST` (not `GET`) and reads JSON body, not query string. New helper file pattern: prefer extending the existing route file (preview vs. consume).

## File map

- `app/api/village/invite-family/accept/route.ts` — split GET (preview, no write) from POST (consume, requires auth). Validate token, bind to caller's Clerk user / new household.
- `app/api/village/route.ts:48,87` — gate POST and DELETE on `requireHouseholdAdmin()`.
- `app/api/village/invite/route.ts:5` — gate on `requireHouseholdAdmin()`. Add allowlist check on `role` and `villageGroup` against `['inner_circle','sitter','covey','field']` post-B4 (or `['covey','field']` if B4 lands first — coordinate sequence) and `app_role` against the spec's allowlist.
- ~~`app/api/notifications/route.ts:80`~~ — DEFERRED (L5). Not touched in this batch.
- `app/api/shifts/[id]/claim/route.ts:33,41,51,58` — resolve caller's user row in the shift's household; require `role === 'caregiver'` (caregivers-only, decision locked 2026-05-02); add `preferredCaregiverId` predicate to the atomic update.
- `app/api/unavailability/route.ts:8-15,55,76` — require active org / `householdId`; resolve `(clerkUserId, householdId)` row.
- `tests/auth-access-family-invite-accept.test.ts` — regression test for L1.
- `tests/auth-access-village-writes.test.ts` — regression for L2 authz.
- `tests/auth-access-village-invite.test.ts` — regression for L3.
- ~~`tests/notifications-household-scope.test.ts`~~ — DEFERRED with L5.
- `tests/auth-access-shift-claim.test.ts` — regression for L6. Asserts: parent (regardless of `isAdmin`) returns 403; non-targeted caregiver returns 403 if `preferredCaregiverId` is set and not them; targeted caregiver succeeds; cross-household caregiver returns 403.
- `tests/auth-access-unavailability-multihousehold.test.ts` — regression for L7.

## Graveyard

(empty)

## Anchors

- `requireHouseholdAdmin()` from B1 — do not bypass.
- `account/route.ts` anonymization tombstone pattern for FK-safe deletes — referenced in B3, leave alone here.
- `lib/api-error.ts` `not_signed_in` / `no_access` / `no_household` keys — use them, do not invent new ones.

## Fragile areas

- `lib/auth/household.ts` — auto-provision path runs Clerk → DB upsert. Changes to `requireHousehold()` affect 12+ routes. Do not change the helper in this batch; only call sites change.
- `app/api/village/invite-family/accept/route.ts` — splitting GET/POST changes a public URL contract. Confirm UI invocations are updated in the same PR or behind a feature flag during rollout.
- L5 scope decision deferred (user direction "not sure" 2026-05-02). Tracked as separate follow-up plan; not in this batch.
- L6 caregiver-role requirement — DECIDED 2026-05-02: caregivers only. Parents cannot claim. The atomic update gate is `caller.role === 'caregiver' AND (shift.preferredCaregiverId IS NULL OR shift.preferredCaregiverId = caller.id)`.

## Regression tests required (Hard Rule #6)

Listed under each L# in the file map above. Each test asserts the falsifiable root cause from synthesis.
