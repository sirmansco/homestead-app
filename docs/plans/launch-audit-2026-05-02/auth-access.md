---
title: Launch audit — Auth and access control
date: 2026-05-02
domain: auth-access
auditor: codex
---

## Summary

I read the mandatory launch bar, prompt template, domain map, every Domain 1 seed file, and `lib/db/schema.ts` for the per-household identity constraint. The schema does enforce `(clerkUserId, householdId)` uniqueness, but the route layer has several authorization gaps: anonymous token consumption, member-management writes available to any active household member, invite writes available to any member, and multi-household writes that bind to the caller's first user row instead of an explicit household. I hit the 25-read cap, so I did not inspect migrations, UI call sites, or tests.

## Findings

### Finding 1 — Family invite validation is an anonymous write path
- **Severity:** blocks-launch
- **Root cause (falsifiable):** `GET /api/village/invite-family/accept` reads only a URL token and updates `family_invites.status` without calling `requireUser()` or `requireHousehold()`.
- **Evidence:** `app/api/village/invite-family/accept/route.ts:14` — handler starts without an auth helper; `app/api/village/invite-family/accept/route.ts:16` — token comes from the query string; `app/api/village/invite-family/accept/route.ts:37` — comment says the token is consumed; `app/api/village/invite-family/accept/route.ts:39` — the route updates `familyInvites`; `app/api/village/invite-family/accept/route.ts:40` — it sets `status: 'accepted'`.
- **Why it matters at 5K:** The security bar says there must be no anonymous write paths, and this path lets any unauthenticated request, crawler, preview bot, or leaked-token visitor consume a family invite before the intended parent signs up.
- **Proposed fix (root cause):** Split invite preview from invite consumption: make unauthenticated validation read-only, then consume the token only from an authenticated accept/finalize endpoint that binds the signed-in Clerk user to the invited email or newly created household.
- **Regression test:** Add `tests/auth-access-family-invite-accept.test.ts` asserting unauthenticated GET does not change invite status and authenticated finalize consumes exactly one pending token.
- **Effort:** M (1-3 days).
- **Cross-references:** Domain 7 should review token exposure and operational handling for invite links.

### Finding 2 — Any household member can create and delete village records
- **Severity:** blocks-launch
- **Root cause (falsifiable):** `POST` and `DELETE` in `app/api/village/route.ts` call `requireHousehold()` but never check `user.role` or `user.isAdmin` before inserting kids/adults or deleting kids/adults in the active household.
- **Evidence:** `app/api/village/route.ts:48` — village write handler begins; `app/api/village/route.ts:50` — it destructures only `household` from `requireHousehold()`; `app/api/village/route.ts:56` — it inserts a kid row; `app/api/village/route.ts:70` — it inserts an adult user row; `app/api/village/route.ts:87` — delete handler begins; `app/api/village/route.ts:89` — delete handler also destructures only `household`; `app/api/village/route.ts:96` — it deletes a kid; `app/api/village/route.ts:98` — it deletes an adult user.
- **Why it matters at 5K:** This is a server-side authorization break on household data: a caregiver with membership can mutate or remove people and children in the household, which is below the launch security bar for write authorization.
- **Proposed fix (root cause):** Introduce a shared household-write authorization helper for member/kid administration and require parent/admin authority before village POST/DELETE, with a narrow allowlist if caregivers truly own any self-service fields.
- **Regression test:** Add `tests/auth-access-village-writes.test.ts` asserting caregiver members receive 403 for kid/adult create/delete while authorized parent/admin users can perform the intended mutations.
- **Effort:** M (1-3 days).
- **Cross-references:** Overlaps with member-management authorization in Finding 4.

### Finding 3 — Any household member can invite new org members
- **Severity:** blocks-launch
- **Root cause (falsifiable):** `POST /api/village/invite` calls `requireHousehold()` and then creates Clerk organization invitations without checking the caller's role or admin status.
- **Evidence:** `app/api/village/invite/route.ts:5` — invite write handler begins; `app/api/village/invite/route.ts:7` — it calls `requireHousehold()` but does not keep the returned `user`; `app/api/village/invite/route.ts:33` — it creates an organization invitation; `app/api/village/invite/route.ts:37` — the Clerk org role is `org:member`; `app/api/village/invite/route.ts:38` — app role and village group are caller-supplied metadata; `app/api/village/invite/route.ts:45` — link-mode invitation creation has the same missing role gate.
- **Why it matters at 5K:** A caregiver or compromised low-privilege household account can add arbitrary people as parents or caregivers, which breaks the launch authorization bar even if the user is authenticated.
- **Proposed fix (root cause):** Require the same centralized household administration authority used for member management before creating Clerk invitations, and constrain caller-supplied `role`/`villageGroup` to what that authority may grant.
- **Regression test:** Add `tests/auth-access-village-invite.test.ts` asserting non-admin/non-parent members cannot create email or link invitations and authorized callers cannot grant roles outside policy.
- **Effort:** M (1-3 days).
- **Cross-references:** Domain 4 may separately grade invite rate-limit persistence and input validation.

### Finding 4 — Household administration routes use inconsistent authority models
- **Severity:** should-fix
- **Root cause (falsifiable):** Admin transfer requires `users.isAdmin`, but household profile and member mutation routes authorize with only active membership or `role === 'parent'`, so the app has no single falsifiable household-admin contract.
- **Evidence:** `app/api/household/admin/route.ts:36` — admin transfer rejects callers without `isAdmin`; `app/api/household/route.ts:76` — household profile PATCH calls `requireHousehold()`; `app/api/household/route.ts:90` — it updates the household row; `app/api/household/route.ts:99` — it updates the Clerk organization name; `app/api/household/members/[id]/route.ts:12` — member PATCH checks only `user.role !== 'parent'`; `app/api/household/members/[id]/route.ts:42` — member DELETE checks only `user.role !== 'parent'`; `lib/db/schema.ts:35` — `users.isAdmin` exists as a separate authority column.
- **Why it matters at 5K:** Divergent authority checks make access behavior hard to reason about and can let non-admin parents perform household-wide mutations even though the codebase models an explicit admin role.
- **Proposed fix (root cause):** Define one server-side helper such as `requireHouseholdAdmin()` or a documented policy matrix, then migrate household profile updates, member updates, member removals, and admin transfer to that helper.
- **Regression test:** Add `tests/auth-access-household-admin.test.ts` asserting the same parent/admin/caregiver matrix across household PATCH, member PATCH, member DELETE, and admin transfer.
- **Effort:** M (1-3 days).
- **Cross-references:** Finding 2 and Finding 3 should use the same helper if village management is admin-only.

### Finding 5 — Shift claim authorization ignores role and preferred caregiver targeting
- **Severity:** should-fix
- **Root cause (falsifiable):** `POST /api/shifts/[id]/claim` authorizes any Clerk org member and atomically claims any open shift without checking that the caller is a caregiver or that `preferredCaregiverId` is null or belongs to the caller.
- **Evidence:** `app/api/shifts/[id]/claim/route.ts:26` — comment scopes authorization to household membership; `app/api/shifts/[id]/claim/route.ts:29` — membership is checked against Clerk org membership; `app/api/shifts/[id]/claim/route.ts:30` — non-members are rejected; `app/api/shifts/[id]/claim/route.ts:33` — existing user row is selected; `app/api/shifts/[id]/claim/route.ts:41` — missing users are inserted as caregiver; `app/api/shifts/[id]/claim/route.ts:51` — claim logic only requires still-open status; `app/api/shifts/[id]/claim/route.ts:58` — update predicate checks only shift id and open status; `lib/db/schema.ts:57` — shifts have a `preferredCaregiverId` column.
- **Why it matters at 5K:** At launch scale, incorrect claims on targeted childcare shifts are user-visible coordination failures, and role/target gates are part of the auth-access contract, not client-side policy.
- **Proposed fix (root cause):** Resolve the caller's user row for the shift household, require `role === 'caregiver'` unless product policy explicitly permits parents, and include `preferredCaregiverId IS NULL OR preferredCaregiverId = caller.id` in the claim authorization and atomic update.
- **Regression test:** Add `tests/auth-access-shift-claim.test.ts` asserting parents and non-targeted caregivers cannot claim restricted shifts, the targeted caregiver can claim, and cross-household members still receive 403.
- **Effort:** M (1-3 days).
- **Cross-references:** Domain 4 should cover UUID/body validation and rate-limit durability for the same route.

### Finding 6 — Multi-household unavailability writes bind to an arbitrary first user row
- **Severity:** should-fix
- **Root cause (falsifiable):** `app/api/unavailability/route.ts` resolves the caller with `where clerkUserId = userId limit 1` and uses that row for all GET, POST, and DELETE operations without household selection.
- **Evidence:** `app/api/unavailability/route.ts:8` — comment says no active org is required; `app/api/unavailability/route.ts:10` — comment says the first user row is used; `app/api/unavailability/route.ts:12` — query selects from `users`; `app/api/unavailability/route.ts:14` — filters only by Clerk user id; `app/api/unavailability/route.ts:15` — limits to one row; `app/api/unavailability/route.ts:55` — POST inserts availability for that resolved user id; `app/api/unavailability/route.ts:76` — DELETE deletes only records for that resolved user id.
- **Why it matters at 5K:** Multi-household caregivers are expected by the launch model, and first-row resolution can attach availability to the wrong household profile or hide another household's availability, degrading access correctness as households overlap.
- **Proposed fix (root cause):** Make unavailability either globally keyed by Clerk identity or explicitly household-scoped; if household-scoped, require a `householdId`/active org and verify the `(clerkUserId, householdId)` row before reads and writes.
- **Regression test:** Add `tests/auth-access-unavailability-multihousehold.test.ts` asserting a caregiver with two household profiles can create, list, and delete availability for the intended household without affecting the other profile.
- **Effort:** M (1-3 days).
- **Cross-references:** Domain 2 should verify whether the schema should key unavailability by user row or Clerk identity.

### Finding 7 — Auth error keys are not uniform across route-level authorization failures
- **Severity:** should-fix
- **Root cause (falsifiable):** `lib/api-error.ts` centralizes `not_signed_in`, `no_access`, and `no_household`, but multiple routes return bespoke 403/409 error strings directly instead of using the same contract.
- **Evidence:** `lib/api-error.ts:11` — central 401 key is `not_signed_in`; `lib/api-error.ts:12` — central 403 key is `no_access`; `lib/api-error.ts:13` — central no-household key is `no_household`; `app/api/shifts/route.ts:159` — parent gate returns a copy-driven sentence for 403; `app/api/bell/[id]/respond/route.ts:48` — non-member response returns `Not a member of this household`; `app/api/household/members/[id]/route.ts:13` — role gate returns `Only parents can change roles`; `app/api/household/members/[id]/route.ts:43` — delete gate returns `Only parents can remove members`.
- **Why it matters at 5K:** The launch bar explicitly requires auth-shape uniformity with no divergence in 401/403/409 keys, and inconsistent keys make clients and ops dashboards misclassify authorization failures.
- **Proposed fix (root cause):** Replace ad hoc route-level auth responses with typed helpers such as `forbidden()`, `conflictNoHousehold()`, and `unauthorized()` that always return the same key while allowing separate display copy where needed.
- **Regression test:** Add `tests/auth-access-error-contract.test.ts` asserting unauthenticated, no-household, and forbidden cases across representative routes all return `not_signed_in`, `no_household`, and `no_access`.
- **Effort:** S (under a day).
- **Cross-references:** Domain 4 also covers API contract uniformity.

## Out-of-domain observations

- `app/api/feedback/route.ts:14` accepts feedback message text without a visible size cap in this read; route this to Domain 7 security/operational readiness or Domain 4 validation.
- `app/api/village/invite-family/route.ts:9` has no visible rate limit around invite creation in this read; route this to Domain 4 rate limiting.
- `app/api/village/invite-family/accept/route.ts:37` consumes tokens during GET, which is also an HTTP semantics/API contract issue for Domain 4.

## What I did not check

I hit the 25-read cap. I did not read migrations beyond the Drizzle schema, did not inspect existing tests, did not inspect UI call sites to see which roles are offered controls, did not inspect Clerk dashboard configuration, and did not run commands that mutate state, servers, or tests.
