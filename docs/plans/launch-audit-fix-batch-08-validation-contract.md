---
title: Launch fix batch 08 — Validation contract (Theme I)
date: 2026-05-02
status: shipped — PR #62 open, CI green, 316/316 tests pass
governs: L23, L24, L8, L25, L26
parent-audit: docs/plans/launch-audit-2026-05-02/synthesis.md
batch-id: B8
prereqs: none (independent of B1–B7)
unblocks: none
supersedes: docs/plans/launch-audit-fix-batch-09-validation-contract.md (wrong batch number; delete that file)
---

## Scope gate

**Goal:** Close all five Theme I findings in one PR. Four are blocks-launch (L23, L24, L26 via severity reconciliation, L8's error-key divergence), one is should-fix (L25). The batch lands as a single migration-free PR — no schema changes required.

**Success criteria (all must be true before merge):**

1. `bell/route.ts` POST rejects non-ISO dates, `end ≤ start`, and windows > 24h with deterministic 400s.
2. The same `parseTimeRange()` helper is used by `bell/route.ts`, `shifts/route.ts` POST, and `unavailability/route.ts` POST — no inline `new Date(...)` / `isNaN` pattern remaining in those three files.
3. Every `[id]` route in `app/api/bell/[id]/`, `app/api/shifts/[id]/claim/`, `app/api/shifts/[id]/cancel/`, `app/api/shifts/[id]/unclaim/` validates UUID shape before DB access and returns 400 for malformed input.
4. `bell/cron/route.ts` returns `{ error: 'not_signed_in' }` (401) instead of `'Unauthorized'`; `bell/[id]/escalate/route.ts` returns `{ error: 'no_access' }` (403) instead of `'wrong household'`; `shifts/route.ts` and `bell/[id]/respond/route.ts` free-text 403s replaced with canonical keys.
5. `feedback/route.ts` POST: body read with Content-Length guard (reject > 16 KB → 413); `message` capped at 4000 chars; `rateLimit({ key: 'feedback:${user.id}', limit: 5, windowMs: 60_000 })` in place.
6. `village/invite-family/route.ts` POST: `rateLimit({ key: 'invite-family:${user.id}', limit: 5, windowMs: 60_000 })` in place, aligned with the existing `village/invite` rate-limit style.
7. Regression tests for every fix; suite stays green; zero new lint problems.

**Out of scope:** L6 (shift claim caregiver role — authz batch, not validation), L27 (upload security — Theme J), `shifts/route.ts` GET scope/query validation, any UI changes.

---

## Spec

### L23 — Bell POST accepts invalid and inverted time ranges

**Root cause (`app/api/bell/route.ts:21,29,38–39`):** `reason`, `startsAt`, `endsAt` presence-checked only; `new Date(startsAt)`/`new Date(endsAt)` inserted with no ISO parse check, no `start < end` guard, no upper bound. A malformed ISO string (e.g., `"not-a-date"`) produces `NaN` in the DB insert; an inverted range (`end < start`) passes silently.

**Existing pattern to match:** `app/api/shifts/route.ts:185–187` and `app/api/unavailability/route.ts:50–52` both do `isNaN(+starts) || isNaN(+ends) || ends <= starts` inline, but with no ISO-format gate and no upper-bound check. The synthesis fix-shape calls for a shared helper — extract and extend, don't duplicate a third time.

**Fix:** New `lib/validate/time-range.ts` exporting:
```ts
export type TimeRangeError = { error: string; status: 400 };
export function parseTimeRange(
  rawStart: unknown,
  rawEnd: unknown,
  opts?: { maxWindowMs?: number }
): { starts: Date; ends: Date } | TimeRangeError
```
Rules inside the helper:
1. Both values must be non-empty strings matching ISO 8601 (simple check: `new Date(val).toISOString() === val` or a stricter regex — see Conventions below).
2. `isNaN(+starts) || isNaN(+ends)` → `{ error: 'startsAt and endsAt must be valid ISO 8601 dates', status: 400 }`.
3. `ends <= starts` → `{ error: 'endsAt must be after startsAt', status: 400 }`.
4. If `opts.maxWindowMs` set: `+ends - +starts > maxWindowMs` → `{ error: 'time window exceeds maximum', status: 400 }`. Bell callers should use 24h (`86_400_000 ms`). Shifts callers should omit (shifts can span days).
5. Returns `{ starts, ends }` on success.

Migrate bell POST, shifts POST, and unavailability POST to use `parseTimeRange`. Inline `isNaN` patterns in shifts/route.ts and unavailability/route.ts are deleted.

---

### L24 — Dynamic UUID route params used without validation

**Root cause:** `app/api/shifts/[id]/claim/route.ts:13,20`, `app/api/shifts/[id]/cancel/route.ts:12,15`, `app/api/bell/[id]/route.ts:13,22` read `[id]` from params and pass directly to `eq(..., id)` DB queries. Postgres UUIDv4 columns cast non-UUID strings to an error, which surfaces as a generic 500 to the caller.

`app/api/shifts/route.ts:15` already defines `const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;` — it is defined but not used for param validation in the same file, and not exported/shared.

**Fix:** Promote to `lib/validate/uuid.ts` (same file as or alongside time-range, whichever is cleaner — see File map). Export:
```ts
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function requireUUID(id: unknown): string | null {
  return typeof id === 'string' && UUID_RE.test(id) ? id : null;
}
```
Apply to every `[id]` dynamic route that reaches DB: `bell/[id]/route.ts`, `shifts/[id]/claim/route.ts`, `shifts/[id]/cancel/route.ts`, `shifts/[id]/unclaim/route.ts`. Pattern:
```ts
const safeId = requireUUID(id);
if (!safeId) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
```
Remove the local `UUID_RE` definition from `shifts/route.ts` once promoted.

Also check `bell/[id]/escalate/route.ts` and `bell/[id]/respond/route.ts` — apply there too if they pass `id` to DB without validation.

---

### L8 — API auth/authz error keys are not uniform

**Root cause:** `lib/api-error.ts:11–13` defines the contract (`not_signed_in`, `no_access`, `no_household`). Three routes bypass it with free-text strings:

| Route | Line | Current (wrong) | Correct |
|---|---|---|---|
| `bell/cron/route.ts` | 37 | `'Unauthorized'` | `'not_signed_in'` with 401 |
| `bell/[id]/escalate/route.ts` | 21 | `'wrong household'` | `'no_access'` with 403 |
| `shifts/route.ts` POST | ~159 | free-text getCopy() 403 | `'no_access'` with 403 |
| `bell/[id]/respond/route.ts` | ~48 | `'Not a member of this household'` | `'no_access'` with 403 |

The synthesis fix-shape also calls for typed helpers (`forbidden()`, `unauthorized()`, `rateLimited()`, `conflictNoHousehold()`) in `lib/api-error.ts`. Evaluate whether this is worth adding:
- `authError()` already handles `not_signed_in` → 401, `no_access` → 403, `no_household` → 409 when thrown via `requireHousehold/requireUser`.
- The divergent cases above are direct `NextResponse.json()` calls bypassing `authError()`. The fix can either (a) add thin typed helpers or (b) simply inline the canonical keys as `NextResponse.json({ error: 'no_access' }, { status: 403 })`.

**Recommendation:** (b) inline canonical keys. The named-helper pattern (`forbidden()`) is a nice-to-have refactor that solves no additional defect and adds surface area. The bar just requires uniform keys — meet the bar. Add helpers only if a future batch has a reason (e.g., injecting `Retry-After` on 429 consistently).

**Exception:** `rateLimitResponse()` in `lib/ratelimit.ts` already returns a proper 429 body; that pattern is already uniform. No change needed there.

---

### L25 — Family invite creation has no rate limit

**Root cause:** `app/api/village/invite-family/route.ts:11,13,28,29` — authenticated, but no `rateLimit()` call. The companion `village/invite/route.ts` does rate-limit (confirmed by grep in the prior batch's audit).

**Fix:** Add after `requireUser()`:
```ts
const rl = rateLimit({ key: `invite-family:${userId}`, limit: 5, windowMs: 60_000 });
const limited = rateLimitResponse(rl);
if (limited) return limited;
```
Key prefix `invite-family:` is distinct from `bell:`, `shift-claim:`, etc. Limit `5/min` aligns with the village-invite route's limit (confirmed via grep).

---

### L26 — Feedback POST has no body-size cap and no rate limit

**Root cause:** `app/api/feedback/route.ts:14` — `await req.json()` on unbounded input. No rate limiter. 37-line file.

**Fix (two-part):**

1. **Body-size guard** — before `req.json()`, check `Content-Length`:
```ts
const cl = Number(req.headers.get('content-length') ?? '0');
if (cl > 16_384) return NextResponse.json({ error: 'request too large' }, { status: 413 });
const body = await req.json() as { message?: string; kind?: string };
```
Note: `Content-Length` is absent on chunked bodies (rare for this endpoint). The guard catches common over-size POSTs; it's not a hard security guarantee without streaming. That's acceptable at this scale.

2. **Message length cap** — after parsing:
```ts
if (message && message.length > 4000) {
  return NextResponse.json({ error: 'message too long (max 4000 chars)' }, { status: 400 });
}
```

3. **Rate limit** — after `requireHousehold()`:
```ts
const rl = rateLimit({ key: `feedback:${user.id}`, limit: 5, windowMs: 60_000 });
const limited = rateLimitResponse(rl);
if (limited) return limited;
```

---

## Conventions (observed in this codebase)

Observed during pattern scan. New code in B8 must match:

1. **Error shape:** `NextResponse.json({ error: '<canonical-key>' }, { status: N })` — one key only, no `message` field. String value is machine-readable (`not_signed_in`, `no_access`, `no_household`, `too_many_requests` is in `rateLimitResponse` but currently uses a sentence — don't change that; it's the existing 429 body).
2. **Rate limiting:** `rateLimit({ key: '<prefix>:${userId}', limit: N, windowMs: N })` → `rateLimitResponse(rl)` → return if non-null. Key prefix uses the route/action name, not the user-facing noun. Applied immediately after auth resolution, before body parse.
3. **Param access:** `const { id } = await ctx.params;` (Promise-unwrap pattern — see `shifts/[id]/claim/route.ts:13`). Some routes use `{ params }: { params: Promise<{id: string}> }` as the second arg type — both styles exist; match the file being edited.
4. **Import order:** Next.js → Drizzle → DB/schema → auth → lib utilities (api-error, ratelimit, notify) → copy.
5. **No `lib/validate/` exists yet** — `lib/validate/time-range.ts` and `lib/validate/uuid.ts` are new files. Keep them thin (pure functions, no Next.js imports). Co-locate or use a single `lib/validate/index.ts` if the file count stays small — evaluate at write time.
6. **Inline time validation pattern (shifts/route.ts, unavailability/route.ts):** `const starts = new Date(body.startsAt); const ends = new Date(body.endsAt); if (isNaN(+starts) || isNaN(+ends) || ends <= starts)` — this is the pattern being _replaced_, not replicated.
7. **`UUID_RE` already defined** in `shifts/route.ts:15` — promote it, don't re-define.

---

## File map

| File | Action | Reason |
|---|---|---|
| `lib/validate/time-range.ts` | **CREATE** | Shared helper for L23; replaces inline patterns |
| `lib/validate/uuid.ts` | **CREATE** | Shared UUID param validator for L24 |
| `app/api/bell/route.ts` | **EDIT** | L23: replace presence-only check with `parseTimeRange` |
| `app/api/shifts/route.ts` | **EDIT** | L23: replace inline `isNaN` with `parseTimeRange`; L24: remove local `UUID_RE`; L8: fix free-text 403 in POST |
| `app/api/unavailability/route.ts` | **EDIT** | L23: replace inline `isNaN` with `parseTimeRange` |
| `app/api/bell/[id]/route.ts` | **EDIT** | L24: validate `bellId` UUID before DB |
| `app/api/shifts/[id]/claim/route.ts` | **EDIT** | L24: validate `id` UUID before DB |
| `app/api/shifts/[id]/cancel/route.ts` | **EDIT** | L24: validate `id` UUID before DB |
| `app/api/shifts/[id]/unclaim/route.ts` | **EDIT** | L24: validate `id` UUID before DB |
| `app/api/bell/[id]/escalate/route.ts` | **EDIT** | L8: `'wrong household'` → `'no_access'`; L24: UUID validate |
| `app/api/bell/[id]/respond/route.ts` | **EDIT** | L8: `'Not a member...'` → `'no_access'`; L24: UUID validate |
| `app/api/bell/cron/route.ts` | **EDIT** | L8: `'Unauthorized'` → `'not_signed_in'` |
| `app/api/feedback/route.ts` | **EDIT** | L26: body-size cap + message cap + rate limit |
| `app/api/village/invite-family/route.ts` | **EDIT** | L25: rate limit |
| `tests/validation-time-range.test.ts` | **CREATE** | L23 regression: parseTimeRange boundary cases |
| `tests/validation-uuid.test.ts` | **CREATE** | L24 regression: requireUUID + route 400 paths |
| `tests/api-error-keys.test.ts` | **CREATE** | L8 regression: cron/escalate/respond/shifts canonical keys |
| `tests/feedback-validation.test.ts` | **CREATE** | L26 regression: size cap + message cap + rate limit |
| `tests/invite-family-ratelimit.test.ts` | **CREATE** | L25 regression: rate limit fires on N+1 |

**File count:** 5 new, 13 edits. All within the declared scope.

---

## Graveyard

*(no failed approaches — first attempt succeeded)*

---

## Anchors

- `app/api/bell/route.ts` rate limiter (`bell:${user.id}`, 3/5min) — survived unchanged ✓
- `app/api/shifts/route.ts` GET scope resolution and multi-household fan-out — untouched ✓
- `lib/api-error.ts` `authError()` / `NotAdminError` discrimination — unchanged ✓
- `lib/ratelimit.ts` public API (`rateLimit`, `rateLimitResponse`, `RateLimitResult`) — unchanged ✓
- All B7 indexes — no migrations in this batch; schema untouched ✓
- `tests/` suite: 316/316 green (was 250 pre-B8; 66 new assertions added) ✓

---

## Fragile areas

1. **`shifts/route.ts` is 260+ lines with complex multi-scope GET.** The POST section (L8 + L23 + L24 fixes) starts at line 155. Edit surgically; the GET section above it is audit-clean.
2. **`parseTimeRange` must not break recurrence expansion.** `shifts/route.ts:223–235` computes `recurrence.endsBy = new Date(recurrence.endsBy)` separately — that is NOT covered by `parseTimeRange`. Leave recurrence handling untouched; only the top-level `startsAt`/`endsAt` pass through the helper.
3. **`bell/[id]/respond/route.ts` auto-creates a `users` row for first-time responders.** The UUID validation goes at the top, before any DB access; the auto-create logic below is untouched.
4. **Content-Length guard is advisory, not cryptographic.** A client can omit the header. The guard catches honest over-size payloads. Note this in the test so a future operator doesn't try to "harden" it into something it isn't.
5. **`shifts/[id]/unclaim/route.ts`** — not yet read in this pattern scan. Read before editing to verify it follows the same `ctx.params` pattern as `claim/cancel`.
