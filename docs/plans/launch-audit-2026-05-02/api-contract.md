---
title: Launch audit — API contract, validation, rate limiting
date: 2026-05-02
domain: API contract, validation, rate limiting
auditor: codex
---

## Summary

I audited the Domain 4 seed files plus directly related dynamic bell/village routes for input validation, rate limiting, error-key consistency, time-format centralization, and `users.is_admin` enforcement. The three named hot paths have rate-limit calls, but several write contracts still allow malformed input to reach database writes, several dynamic UUID params are never validated before UUID-column queries, and admin-like member mutations still gate on `role` instead of `isAdmin`. I did not find per-screen time formatting that bypasses `lib/format/time.ts`; the matches I checked were imports or wrappers around that module.

## Findings

### Finding AP1 — Bell POST accepts invalid and inverted time ranges
- **Severity:** BLOCKS-LAUNCH
- **Root cause (falsifiable):** `POST /api/bell` only checks that `reason`, `startsAt`, and `endsAt` are present, then inserts `new Date(startsAt)` and `new Date(endsAt)` without validating ISO parse success or `startsAt < endsAt`.
- **Evidence:** `app/api/bell/route.ts:21` parses the request body; `app/api/bell/route.ts:29` only checks presence; `app/api/bell/route.ts:38` and `app/api/bell/route.ts:39` insert `new Date(startsAt)` and `new Date(endsAt)` directly.
- **Why it matters at 5K:** The launch bar requires consistent write-route time validation and a hot-path p95/5xx budget; malformed lantern requests can become 500s or nonsensical active bells instead of deterministic 400s.
- **Proposed fix (root cause):** Add a shared time-range validator used by bell, shifts, and unavailability writes that rejects non-ISO/invalid dates, `end <= start`, and out-of-bounds windows before any insert.
- **Regression test:** `tests/api-bell-time-range-validation.test.ts` — `POST /api/bell` rejects invalid dates and `endsAt <= startsAt` with 400.
- **Effort:** S
- **Cross-references:** Domain 3 N1 lantern caller-visible no-op concerns overlap with the same hot path; this finding is specifically about request contract validation.

### Finding AP2 — Dynamic UUID route params are used in DB queries without UUID validation
- **Severity:** BLOCKS-LAUNCH
- **Root cause (falsifiable):** Dynamic write routes read `ctx.params.id` or `params.id` and pass it to `eq(...id, id)` without first validating UUID shape.
- **Evidence:** `app/api/shifts/[id]/claim/route.ts:13` reads `id`, and `app/api/shifts/[id]/claim/route.ts:20` queries `shifts.id` with it; `app/api/shifts/[id]/cancel/route.ts:12` reads `id`, and `app/api/shifts/[id]/cancel/route.ts:15` queries `shifts.id` with it; `app/api/bell/[id]/route.ts:13` reads `bellId`, and `app/api/bell/[id]/route.ts:22` queries `bells.id` with it.
- **Why it matters at 5K:** Invalid UUID path probes on hot write routes can surface database cast failures as 500s, violating the uniform contract and the `<0.1%` 5xx bar.
- **Proposed fix (root cause):** Centralize UUID param parsing, return a uniform 400 error before DB access, and apply it to all `[id]` API routes.
- **Regression test:** `tests/api-dynamic-id-validation.test.ts` — malformed IDs on claim, cancel, and bell status routes return 400 without issuing a DB UUID query.
- **Effort:** S
- **Cross-references:** None.

### Finding AP3 — Member mutation routes still gate on parent role instead of users.is_admin
- **Severity:** BLOCKS-LAUNCH
- **Root cause (falsifiable):** `/api/household/members/[id]` authorizes role changes and member deletion with `user.role !== 'parent'` instead of checking `users.isAdmin`, while `/api/household/admin` proves `isAdmin` is the admin authority.
- **Evidence:** `app/api/household/members/[id]/route.ts:12` gates role changes on `user.role`; `app/api/household/members/[id]/route.ts:42` gates deletion on `user.role`; `app/api/household/admin/route.ts:31` re-reads `users.isAdmin`, and `app/api/household/admin/route.ts:36` refuses callers whose `isAdmin` is false.
- **Why it matters at 5K:** The charter requires `users.is_admin` to be checked in admin-gated routes; using broad parent role lets non-admin parents perform household administration and keeps the Domain 1 role-downgrade/access findings live.
- **Proposed fix (root cause):** Route all admin-only household member mutations through a shared admin guard that re-reads the caller row and checks `isAdmin` inside the active household.
- **Regression test:** `tests/household-members-admin-gate.test.ts` — a parent with `isAdmin=false` cannot PATCH or DELETE another member, while the admin can.
- **Effort:** M
- **Cross-references:** Domain 1 A2 village CRUD no admin gate and A5 role downgrade.

### Finding AP4 — Family invite creation has no rate limit
- **Severity:** SHOULD-FIX
- **Root cause (falsifiable):** `POST /api/village/invite-family` authenticates the caller and creates a `familyInvites` row, but never calls `rateLimit` before accepting `parentEmail` and inserting the invite.
- **Evidence:** `app/api/village/invite-family/route.ts:11` authenticates with `requireUser`; `app/api/village/invite-family/route.ts:13` parses the body; `app/api/village/invite-family/route.ts:28` creates a token; `app/api/village/invite-family/route.ts:29` inserts the invite.
- **Why it matters at 5K:** Invite creation is an externally shareable write path; without per-user throttling it can be abused to create unbounded invite rows or email/link churn even though the three named hot paths are limited.
- **Proposed fix (root cause):** Add a per-user invite-family limiter using the existing rate-limit helper, aligned with `/api/village/invite` limits and returning the shared 429 contract.
- **Regression test:** `tests/village-invite-family-rate-limit.test.ts` — repeated invite-family POSTs over the configured limit return 429 and do not insert additional invite rows.
- **Effort:** S
- **Cross-references:** Domain 1 flagged family invite creation as missing rate limiting.

### Finding AP5 — Feedback POST has no message size cap or rate limit
- **Severity:** SHOULD-FIX
- **Root cause (falsifiable):** `POST /api/feedback` trims `message` for presence and validates `kind`, then inserts the full message without a length cap or rate-limit check.
- **Evidence:** `app/api/feedback/route.ts:14` parses `{ message, kind }`; `app/api/feedback/route.ts:15` only trims `message`; `app/api/feedback/route.ts:19` validates `kind`; `app/api/feedback/route.ts:23` inserts the uncapped `message`.
- **Why it matters at 5K:** Feedback is a write path exposed to every household; large or repeated submissions can inflate DB/storage and support noise without hitting the hot-path limiters.
- **Proposed fix (root cause):** Add a feedback-specific per-user rate limit and a server-side maximum message length before insert, with deterministic 400/429 responses.
- **Regression test:** `tests/feedback-contract.test.ts` — oversized feedback returns 400 and repeated valid feedback over the limit returns 429 without insertion.
- **Effort:** S
- **Cross-references:** Domain 1 running synthesis flagged feedback body with no size cap.

### Finding AP6 — Auth and authorization error keys are not uniform
- **Severity:** SHOULD-FIX
- **Root cause (falsifiable):** The shared auth helper emits machine keys such as `not_signed_in` and `no_access`, but API routes still return divergent strings like `Unauthorized`, human-readable parent-role messages, and `wrong household`.
- **Evidence:** `lib/api-error.ts:11` returns `{ error: 'not_signed_in' }`; `lib/api-error.ts:12` returns `{ error: 'no_access' }`; `app/api/bell/cron/route.ts:10` returns `{ error: 'Unauthorized' }`; `app/api/household/members/[id]/route.ts:13` returns `{ error: 'Only parents can change roles' }`; `app/api/bell/[id]/escalate/route.ts:21` returns `{ error: 'wrong household' }`.
- **Why it matters at 5K:** The launch bar calls for one auth return contract; divergent keys force client-side special cases and make 401/403/409 telemetry harder to aggregate.
- **Proposed fix (root cause):** Define a small API error-key enum/helper for auth, authorization, validation, conflict, and rate-limit responses, then replace route-local auth/authorization strings with those keys.
- **Regression test:** `tests/api-error-contract.test.ts` — representative 401/403/409 responses from cron, member mutation, and bell escalation use the shared error keys.
- **Effort:** M
- **Cross-references:** Domain 1 auth/access findings rely on clear 401/403/409 distinction.

### Finding AP7 — Family invite acceptance mutates state in a GET route
- **Severity:** BLOCKS-LAUNCH
- **Root cause (falsifiable):** `GET /api/village/invite-family/accept` marks a pending invite as accepted during the read used to validate the token.
- **Evidence:** `app/api/village/invite-family/accept/route.ts:7` documents the route as GET validation; `app/api/village/invite-family/accept/route.ts:14` implements `GET`; `app/api/village/invite-family/accept/route.ts:37` describes consuming the token; `app/api/village/invite-family/accept/route.ts:39` updates `familyInvites`; `app/api/village/invite-family/accept/route.ts:40` sets `status: 'accepted'`.
- **Why it matters at 5K:** GET requests can be prefetched, retried, crawled, or link-scanned; consuming invite tokens on a read can turn real onboarding attempts into `invite_used` failures.
- **Proposed fix (root cause):** Split token preview from acceptance: make GET side-effect-free and move consumption to an authenticated POST that runs at the actual acceptance step.
- **Regression test:** `tests/family-invite-accept-method-contract.test.ts` — GET previews do not change invite status, and POST consumes exactly one pending invite.
- **Effort:** M
- **Cross-references:** Domain 1 A1 anonymous invite-family accept; this finding is limited to HTTP method and state-change contract.

## Summary table

| ID | Severity | Title |
|---|---|---|
| AP1 | BLOCKS-LAUNCH | Bell POST accepts invalid and inverted time ranges |
| AP2 | BLOCKS-LAUNCH | Dynamic UUID route params are used in DB queries without UUID validation |
| AP3 | BLOCKS-LAUNCH | Member mutation routes still gate on parent role instead of users.is_admin |
| AP4 | SHOULD-FIX | Family invite creation has no rate limit |
| AP5 | SHOULD-FIX | Feedback POST has no message size cap or rate limit |
| AP6 | SHOULD-FIX | Auth and authorization error keys are not uniform |
| AP7 | BLOCKS-LAUNCH | Family invite acceptance mutates state in a GET route |

## Cross-domain references

- Domain 1 A1 overlaps AP7 on invite-family accept, but AP7 is the HTTP method/state-change contract defect.
- Domain 1 A2 and A5 overlap AP3 because member/village administration still depends on broad `parent` role gates rather than `users.is_admin`.
- Domain 1 flagged family invite creation with no rate limit; AP4 independently verifies it from source.
- Domain 1 flagged feedback body with no size cap; AP5 independently verifies it from source.
- Domain 3 N1 overlaps AP1 only insofar as both affect the bell hot path; AP1 is specifically invalid time-range acceptance.

## Out-of-domain observations

- `app/api/upload/route.ts:40` validates the filename extension and `app/api/upload/route.ts:57` passes through `file.type`; full content-type sniffing belongs to Domain 7.
- `app/api/village/route.ts:48` and `app/api/village/route.ts:87` mutate household adults/kids without an admin gate; this is primarily Domain 1 auth/access and should be deduped with A2.

## What I did not check

- I did not run tests or load tests; this was source inspection only.
- I did not read every API route in the repository, so less common write paths outside the seed list may still have validation or rate-limit drift.
- I did not read Next.js 16 docs because this audit did not change framework code or rely on undocumented Next.js behavior.
