---
title: Launch fix batch 09 — API validation contract
date: 2026-05-02
status: pending
governs: L8, L23, L24, L25, L26
parent-audit: docs/plans/launch-audit-2026-05-02/synthesis.md
batch-id: B9
prereqs: none (independent)
unblocks: none
---

## Spec

After this batch, every write route on Covey returns one set of error keys, validates time ranges through one helper, validates UUIDs through one helper, rate-limits the family-invite and feedback paths, and caps body size on feedback. Specifically:

1. **L8** — `lib/api-error.ts` exports typed helpers: `unauthorized()` → 401 `{ error: 'not_signed_in' }`; `forbidden()` → 403 `{ error: 'no_access' }`; `conflictNoHousehold()` → 409 `{ error: 'no_household' }`; `rateLimited()` → 429 `{ error: 'rate_limited' }`; `badRequest(reason)` → 400 with a stable `{ error: reason }`. Routes returning ad hoc strings migrate to these helpers (`app/api/bell/cron/route.ts:10`, `app/api/household/members/[id]/route.ts:13,43`, `app/api/bell/[id]/escalate/route.ts:21`, `app/api/shifts/route.ts:159`, `app/api/bell/[id]/respond/route.ts:48`).
2. **L23** — `lib/validate/time-range.ts` exports `parseTimeRange(startsAt, endsAt, opts)` returning `{ start: Date, end: Date }` or throwing a typed `BadTimeRangeError` mapped to 400. Used in `app/api/bell/route.ts:38-39`, `app/api/shifts/route.ts` POST, `app/api/unavailability/route.ts` POST.
3. **L24** — `lib/validate/uuid.ts` exports `parseUuid(value)` returning the validated UUID or throwing. Applied to every `[id]` route reading path params (`app/api/shifts/[id]/claim/route.ts:13`, `app/api/shifts/[id]/cancel/route.ts:12`, `app/api/bell/[id]/route.ts:13`, plus respond/unclaim/escalate variants).
4. **L25** — `app/api/village/invite-family/route.ts` adds `rateLimit({ key: 'invite-family:${user.id}', limit: 10, windowMs: 60*60_000 })`.
5. **L26** — `app/api/feedback/route.ts:14` reads body as text with explicit `Content-Length` check (reject > 16KB → 413), then `JSON.parse`. Adds `rateLimit({ key: 'feedback:${user.id}', limit: 5, windowMs: 60_000 })`. Caps `message.length` to 4000 chars.

**Done criteria:** Each helper exists and is the only path used in the migrated routes. `grep -rn "{ error: 'Unauthorized'" app/api/` returns zero. Time-range and UUID validation rejects malformed input with deterministic 400 before any DB call. Feedback POST returns 413 on oversized body and 429 after 5 requests/minute.

**Out of scope:** Refactoring all 20+ `lib/api-error.ts` importers to use the new typed helpers — only routes that currently diverge are migrated in this batch. Other routes can adopt incrementally.

## Conventions

Pattern scan (`lib/api-error.ts`, `lib/ratelimit.ts`, representative routes):
- `apiError(err, ...)` and `authError(err, ...)` already centralize error-handling. New helpers return `NextResponse.json(...)` directly.
- `rateLimit({ key, limit, windowMs })` returns a struct; `rateLimitResponse(rl)` returns a 429 if limited, else `null`. Pattern from `app/api/upload/route.ts:26-29`.
- UUID format check: regex `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i` is sufficient for Postgres `uuid` columns.

## File map

- `lib/api-error.ts` — add typed helpers (L8).
- `lib/validate/time-range.ts` — new file (L23).
- `lib/validate/uuid.ts` — new file (L24).
- `app/api/bell/route.ts:38-39` — use `parseTimeRange`.
- `app/api/shifts/route.ts` POST — use `parseTimeRange`.
- `app/api/unavailability/route.ts` POST — use `parseTimeRange`.
- `app/api/shifts/[id]/claim/route.ts:13`, `app/api/shifts/[id]/cancel/route.ts:12`, `app/api/bell/[id]/route.ts:13`, plus respond/unclaim/escalate — `parseUuid` on path params.
- `app/api/village/invite-family/route.ts` — add `rateLimit`.
- `app/api/feedback/route.ts:14,23,29` — body cap, rate limit, message length cap.
- `app/api/bell/cron/route.ts:10`, `app/api/household/members/[id]/route.ts:13,43`, `app/api/bell/[id]/escalate/route.ts:21`, `app/api/shifts/route.ts:159`, `app/api/bell/[id]/respond/route.ts:48` — error-key migration.
- `tests/api-error-contract.test.ts` — regression for L8.
- `tests/api-bell-time-range-validation.test.ts` — regression for L23 (covers shifts and unavailability via shared helper).
- `tests/api-dynamic-id-validation.test.ts` — regression for L24.
- `tests/village-invite-family-rate-limit.test.ts` — regression for L25.
- `tests/feedback-contract.test.ts` — regression for L26.

## Graveyard

(empty)

## Anchors

- `lib/api-error.ts:11-13` `not_signed_in`/`no_access`/`no_household` keys — preserve exactly.
- `lib/ratelimit.ts` window/limit semantics — do not change.
- The three named hot paths already rate-limited (`/api/bell` POST, `/api/shifts` POST, `/api/shifts/[id]/claim`) — preserve their existing limiters; this batch only adds limiters where missing.

## Fragile areas

- Body-size cap implementation: `req.json()` does not respect `Content-Length`. Use `req.text()` then size-check, then parse. Some Edge runtimes enforce a body limit by default; do not assume.
- `parseTimeRange` upper bound — pick a sane policy (e.g., reject ranges > 1 year in the future). Spec may dictate.
- UUID regex catches the format but not validity (e.g., a malformed v4 with wrong version nibble passes); acceptable tradeoff because the goal is to keep cast-failures out of Postgres, not enforce v4-ness.

## Regression tests required (Hard Rule #6)

Listed in the file map. Each asserts the falsifiable root cause from synthesis L8/L23/L24/L25/L26.
