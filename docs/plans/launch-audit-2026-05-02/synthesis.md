---
title: Launch audit — synthesis
date: 2026-05-02
governs: docs/plans/launch-audit-2026-05-02/
phase: 3
inputs:
  - auth-access.md
  - data-integrity.md
  - notifications-observability.md
  - api-contract.md
  - pwa-sw-push.md
  - performance.md
  - security-ops.md
---

## Method

Phase 3 deduplicates per-domain findings into a single source of truth for fix sequencing. Each unique-root-cause finding is assigned a stable ID (`L#`), traces back to every domain finding it consolidates, and carries one severity (the most severe of its constituents). Domain findings without overlap pass through unchanged. Findings that overlap by **root cause and fix** are collapsed into a single `L#`; findings that share a code surface but require independent fixes are kept separate with cross-references.

The bar is `docs/plans/launch-readiness-5k.md`. Severity maps directly: blocks-launch, should-fix, nice-to-have, out-of-scope.

## Counts (post-dedupe)

| Severity | Count |
|---|---|
| blocks-launch | 16 |
| should-fix | 14 |
| nice-to-have | 0 |
| out-of-scope | 0 |
| **Total unique findings** | **30** |

Pre-dedupe per-domain totals: Domain 1 = 7 (3 blocks-launch / 4 should-fix); Domain 2 = 4 (1 BL / 3 SF); Domain 3 = 5 (3 BL / 2 SF); Domain 4 = 7 (4 BL / 3 SF); Domain 5 = 3 (1 BL / 2 SF); Domain 6 = 5 (3 BL / 2 SF); Domain 7 = 7 (3 BL / 4 SF). 38 raw findings collapsed via 8 cross-domain merges into 30 unique launch-relevant items. Severity reconciliations (3) tipped 3 findings from should-fix to blocks-launch — see "Severity reconciliations" below.

## Consolidated findings

### L1 — `/api/village/invite-family/accept` is an anonymous, state-mutating GET
- **Severity:** blocks-launch
- **Root cause:** `app/api/village/invite-family/accept/route.ts:14` is a `GET` handler with no `requireUser()`/`requireHousehold()` call that updates `familyInvites.status = 'accepted'` (line 39-40). Two distinct defects share one fix path: (a) anonymous write, (b) state-changing GET.
- **Constituent findings:** auth-access F1 (anonymous write), api-contract AP7 (GET semantics).
- **Fix shape:** Split preview from acceptance. GET becomes side-effect-free token preview. Authenticated POST consumes the token, binding the signed-in Clerk user to the invited email or new household.
- **Bar tie:** Security bar — "no anonymous write paths."
- **Effort:** M

### L2 — Village member CRUD has no admin-role gate
- **Severity:** blocks-launch
- **Root cause:** `app/api/village/route.ts` POST (line 48) and DELETE (line 87) call `requireHousehold()` but never check `user.role`/`user.isAdmin` before inserting/deleting kids and adults. Compounded by FK behavior — when DELETE runs against a `users` row that has authored shifts/bells (`shifts.created_by_user_id`/`bells.created_by_user_id` are `ON DELETE restrict`), the route 500s instead of returning a clean 4xx (data-integrity F1, partially scoped to this surface).
- **Constituent findings:** auth-access F2 (no admin gate), data-integrity F1 (FK restrict on user-row delete becomes 5xx). Also references api-contract AP3 (member admin gate uses `role` not `isAdmin`) — same authority defect, separate route file.
- **Fix shape:** Add admin-role gate (shared `requireHouseholdAdmin()` helper; see L4) at both endpoints. Delete path: route through a tombstone service that detects authored history and either tombstones the row or returns 409 with explicit reason; never raw-DELETE a `users` row.
- **Bar tie:** Security bar (authorization), data-integrity bar (FK behavior).
- **Effort:** M

### L3 — Village invite (Clerk org invite) has no admin-role gate
- **Severity:** blocks-launch
- **Root cause:** `app/api/village/invite/route.ts:5` calls `requireHousehold()` but does not retain `user`; the route then creates Clerk org invitations (line 33) and accepts caller-supplied `app_role` and `villageGroup` metadata (line 38). No role check on the caller.
- **Constituent findings:** auth-access F3.
- **Fix shape:** Same shared admin helper as L2/L4. Validate caller-supplied role/villageGroup against an allowlist that the helper authorizes.
- **Bar tie:** Security bar (authorization).
- **Effort:** M

### L4 — Household administration uses divergent authority models (`role === 'parent'` vs `users.isAdmin`)
- **Severity:** blocks-launch
- **Root cause:** `app/api/household/admin/route.ts:36` correctly checks `users.isAdmin`. `app/api/household/route.ts:76` (PATCH household profile), `app/api/household/members/[id]/route.ts:12,42` (member PATCH/DELETE) gate only on `user.role !== 'parent'`. Three different authority contracts for the same admin tier. Domain 4 raised as blocks-launch (AP3); Domain 1 as should-fix (F4). Resolution: blocks-launch — the divergence is the foundation that L2 and L3 also fail against, and Domain 4's AP3 evidence (admin route proves `isAdmin` is the contract) is the more direct read of the launch bar.
- **Constituent findings:** auth-access F4, api-contract AP3.
- **Fix shape:** Define one server-side `requireHouseholdAdmin()` helper that re-reads the caller row inside the active household and checks `isAdmin`. Migrate household profile PATCH, member PATCH/DELETE, admin transfer, village CRUD (L2), and village invite (L3) to that helper. This is the prerequisite fix for L2, L3.
- **Bar tie:** Security bar (auth-shape uniformity, authorization).
- **Effort:** M

### L5 — Notifications IDOR (notifications/route.ts bulk-update by Clerk identity)
- **Severity:** should-fix
- **Root cause:** Domain 1 flagged this as A4 in its synthesis brief (no IDOR guard on notification reads/deletes); Domain 3's confirmation (line 66) is that `app/api/notifications/route.ts:80` updates every `users` row matching the Clerk identity, matching the comment at line 61 — i.e., the intended behavior is bulk by Clerk identity, not a single-row IDOR. The risk reduces to: a multi-household user's notification preferences in household A are silently flipped when the same user toggles them from household B's session. Synthesis: this is a should-fix (multi-household identity-scoping defect, not a true cross-tenant IDOR), not the blocks-launch the running synthesis assumed.
- **Constituent findings:** auth-access "A4" (running-synthesis label only — not in the published auth-access.md numbered findings; Domain 3 confirmed by reading the route).
- **Fix shape:** Decide whether notification preferences are Clerk-identity-scoped (current behavior, intentional) or `(clerkUserId, householdId)`-scoped. If household-scoped, change the WHERE in `app/api/notifications/route.ts:80` to also bind `householdId`. Update spec NN to match.
- **Bar tie:** Data-integrity bar (per-household identity invariant).
- **Effort:** S

### L6 — Shift claim authorization ignores caregiver role and `preferredCaregiverId` targeting
- **Severity:** should-fix
- **Root cause:** `app/api/shifts/[id]/claim/route.ts:51-58` updates on `(id, status='open')` only — no check that caller has `role='caregiver'` or that `preferredCaregiverId IS NULL OR preferredCaregiverId = caller.id`. Auto-creates missing user as caregiver (line 41).
- **Constituent findings:** auth-access F5.
- **Fix shape:** Resolve caller's `users` row for the shift's household, require caregiver role unless explicitly permitted, include `preferredCaregiverId` predicate in the atomic update.
- **Bar tie:** Security bar (authorization), spec correctness.
- **Effort:** M

### L7 — Multi-household unavailability writes bind to the first user row
- **Severity:** should-fix
- **Root cause:** `app/api/unavailability/route.ts:12-15` selects `users` by Clerk userId LIMIT 1, ignoring household scoping. POST (line 55) and DELETE (line 76) operate on that first row. A multi-household caregiver loses ability to manage availability per household.
- **Constituent findings:** auth-access F6.
- **Fix shape:** Decide spec direction (Clerk-identity-global vs. household-scoped). If household-scoped, require `householdId`/active org and resolve `(clerkUserId, householdId)` row before reads/writes.
- **Bar tie:** Data-integrity bar (per-household identity invariant); spec compliance.
- **Effort:** M

### L8 — API auth/authz error keys are not uniform
- **Severity:** should-fix
- **Root cause:** `lib/api-error.ts:11-13` defines `not_signed_in`, `no_access`, `no_household` as the contract. Routes return divergent strings: `app/api/bell/cron/route.ts:10` (`Unauthorized`), `app/api/household/members/[id]/route.ts:13,43` (free-text `"Only parents can change roles"`), `app/api/bell/[id]/escalate/route.ts:21` (`wrong household`), `app/api/shifts/route.ts:159`, `app/api/bell/[id]/respond/route.ts:48` (free text).
- **Constituent findings:** auth-access F7, api-contract AP6.
- **Fix shape:** Add typed `forbidden()`, `conflictNoHousehold()`, `unauthorized()`, `rateLimited()` helpers in `lib/api-error.ts`. Migrate every route that returns auth/authz errors to those helpers. Display copy (UI strings) lives separately from machine keys.
- **Bar tie:** Reliability bar — "Auth-shape uniformity, one helper, one return contract."
- **Effort:** M

### L9 — Member/village hard-delete on `users` rows can 5xx via FK restrict
- **Severity:** blocks-launch
- **Root cause:** `app/api/household/members/[id]/route.ts:53` and `app/api/village/route.ts:98` call `db.delete(users)`. `lib/db/schema.ts:55,76` shows `shifts.createdByUserId` and `bells.createdByUserId` reference `users.id` `ON DELETE restrict`. A user with authored shifts/bells fails the DELETE with a generic 5xx instead of a clear blocked-or-tombstone path. (`app/api/account/route.ts:120` already proves the right pattern — anonymization/tombstone — but it isn't reused here.)
- **Constituent findings:** data-integrity F1 (full evidence here; partial overlap with L2's village delete surface). Kept separate because the household-members route is a distinct surface and the fix is the shared tombstone service.
- **Fix shape:** Centralize user-removal in one service that detects authored history and either (a) anonymizes the row (`[deleted]` placeholder per spec NN #16b) preserving FKs, or (b) returns 409 with explicit reason. Reuse from `account/route.ts`.
- **Bar tie:** Data-integrity bar (FK cascades safe or blocked with clear 4xx).
- **Effort:** M

### L10 — Legacy `inner_circle`/`sitter` village-group values still insertable; notification queries only match `covey`/`field`
- **Severity:** blocks-launch
- **Root cause:** `lib/db/schema.ts:6` enum still includes `'inner_circle','sitter','covey','field'`. `lib/auth/household.ts:40` Clerk metadata type accepts old values; line 55 inserts directly. `app/api/bell/[id]/respond/route.ts:53,60` accepts and inserts old values. `lib/notify.ts:257-264` selects bell-ring recipients only on `users.villageGroup = 'covey'`; `lib/notify.ts:286-293` only on `'field'`. Result: a legacy caregiver row is silently skipped in lantern fan-out and escalation, producing a 200 with zero recipients — exact failure mode the silent-no-op bar prohibits.
- **Constituent findings:** data-integrity F2 (write side), notifications-observability F2 (read side / silent miss). Single root cause, single coordinated fix.
- **Fix shape:** Add a `normalizeVillageGroup()` helper used at every write boundary (`requireHousehold()` auto-provision, bell respond auto-create, any other Clerk-metadata insert). Backfill production rows. Add a DB CHECK constraint or remove old enum labels after backfill verifies zero rows. Until removal, notification filters use a normalized read (`IN ('covey','inner_circle')` for inner-circle, `IN ('field','sitter')` for field) as a transitional read-compat layer.
- **Bar tie:** Reliability bar (silent failure rate < 0.5%), data-integrity bar (enum migration fully landed).
- **Effort:** M

### L11 — Raw schema-mutating scripts bypass Drizzle and have drifted
- **Severity:** should-fix
- **Root cause:** `scripts/migrate-kids.ts:9,15`, `scripts/migrate-shifts.ts:13,26`, `scripts/migrate-users-unique.ts:11` create/alter schema outside `drizzle/` and the journal. Two scripts no longer match `lib/db/schema.ts`.
- **Constituent findings:** data-integrity F3.
- **Fix shape:** Delete or quarantine. Any still-needed migration lives in `drizzle/` only. Production migration entrypoint runs `drizzle-kit` plus `db:doctor` only.
- **Bar tie:** Data-integrity bar (Drizzle schema is source of truth).
- **Effort:** S

### L12 — `db:doctor` does not verify the full schema-authority bar
- **Severity:** should-fix
- **Root cause:** `scripts/doctor.ts:38-40` `EXPECTED_COLUMNS` covers only `users`, `bells`, `kids`, `feedback`. `lib/db/schema.ts:88` `pushSubscriptions` is not covered. Line 128 fails only on missing-expected; ignores extras and constraints.
- **Constituent findings:** data-integrity F4.
- **Fix shape:** Generate doctor expectations from Drizzle metadata. Fail on missing AND extra live columns plus missing unique/FK constraints.
- **Bar tie:** Data-integrity bar (no orphan columns; migration journal in sync with `information_schema`).
- **Effort:** M

### L13 — Lantern caller-visible counts can claim success when zero pushes attempted or VAPID missing
- **Severity:** blocks-launch
- **Root cause:** `lib/notify.ts:267-274` ignores `pushToUsers()`'s `PushResult` and returns `{ sent: innerCircle.length, eligible: innerCircle.length }`. `lib/push.ts:57-58` returns `vapid_not_configured` with zero delivered; `lib/push.ts:147-155` returns `attempted: 0, delivered: 0` for empty subs. Caller sees `sent > 0` while nothing went out. Compounded on the client: `app/components/PushRegistrar.tsx:90,96` and `app/components/ScreenSettings.tsx:69,72,241` show "Push notifications enabled" based on `Notification.permission` even when `/api/push/subscribe` failed.
- **Constituent findings:** notifications-observability F1, pwa-sw-push PWA1. Server and client halves of the same silent-success defect.
- **Fix shape:** Server: return structured push outcomes (`eligibleUsers`, `attemptedSubscriptions`, `delivered`, `stale`, `failed`, `reason`); `POST /api/bell` surfaces those instead of synthesizing `sent`. Client: track separate registration state in `requestPushPermission()` consumers; render only when both browser permission AND server registration succeed.
- **Bar tie:** Reliability bar (Bell silent-no-op visibility, < 0.5% silent-failure rate).
- **Effort:** M

### L14 — `/api/bell/cron` route exists but is not wired in `vercel.json`
- **Severity:** blocks-launch
- **Root cause:** `app/api/bell/cron/route.ts:7-30` is correctly authed (Bearer `CRON_SECRET`) and idempotent (`escalated_at IS NULL`). `vercel.json` contents in full: `{ "buildCommand": "npm run db:migrate && next build" }`. No `crons` array. Escalation never fires in production. Spec promises 5-min escalation from inner-circle to field tier.
- **Constituent findings:** notifications-observability F3, security-ops F4. Single fix.
- **Fix shape:** Add `"crons": [{ "path": "/api/bell/cron", "schedule": "* * * * *" }]` and `"functions": { "app/api/bell/cron/route.ts": { "maxDuration": 30 } }` to `vercel.json`.
- **Bar tie:** Reliability bar (spec escalation contract).
- **Effort:** S

### L15 — Bell cron escalation processes unbounded backlog concurrently
- **Severity:** should-fix
- **Root cause:** `app/api/bell/cron/route.ts:14-22` selects every due bell with no `LIMIT` and runs `escalateBell` over all rows via `Promise.allSettled`. After L14 fix, a backlog post-outage will fan out unbounded DB reads and push sends inside one function invocation.
- **Constituent findings:** performance F4.
- **Fix shape:** Bound `LIMIT` per cron tick. Add index `(status, escalated_at, created_at)` matching the WHERE. Cap concurrency via `p-limit` or process in a single SQL `UPDATE ... RETURNING` batch before notifying.
- **Bar tie:** Performance bar (p95 cron route under bound), reliability bar (function timeouts).
- **Effort:** M

### L16 — Notification side-effects have silent no-op early returns
- **Severity:** should-fix
- **Root cause:** `lib/notify.ts:15-16` (Resend missing or empty list), `49` (missing shift/household), `128-135` (claim target absent or creator opted out), `265` (empty inner circle), `294` (empty field set), `327-328` (no parents opted into bell responses) all return without emitting a structured log. Operations cannot distinguish intentional suppression from broken pipeline.
- **Constituent findings:** notifications-observability F4.
- **Fix shape:** Shared notification result/log helper. Every notify function emits one structured line with `event`, `context`, `status`, recipient counts, suppression reason before returning.
- **Bar tie:** Reliability bar (every async side-effect emits a log line).
- **Effort:** M

### L17 — Push pruning only handles 404/410; permanent 4xx subscriptions persist
- **Severity:** should-fix
- **Root cause:** `lib/push.ts:73-85` deletes only `404|410`. Other permanent invalid-subscription 4xx (provider-specific) are counted as failures and retained. Endpoints retried on every fan-out, inflating cost and noise.
- **Constituent findings:** notifications-observability F5.
- **Fix shape:** Classify Web Push status codes explicitly. Prune documented permanent failures. Retain retryable 429/5xx. Include classification in `push_batch` log.
- **Bar tie:** Reliability bar (push delivery observability), performance bar (fan-out cost).
- **Effort:** S

### L18 — `push_subscriptions` lacks `(user_id, endpoint)` uniqueness; concurrent registrations duplicate rows
- **Severity:** blocks-launch
- **Root cause:** `lib/db/schema.ts:88-96` `pushSubscriptions` has no table-level unique callback. `app/api/push/subscribe/route.ts:22-31` is a select-then-insert upsert — race window allows duplicates. `lib/push.ts:150` selects all matching rows; `lib/push.ts:66` sends one network request per row. Result: duplicate visible notifications, fan-out cost multiplier on every bell. Domain 5 PWA3 framed as should-fix; Domain 6 P3 framed as blocks-launch given the 5K fan-out math (10 bells/min × 2-10 recipients × N duplicate subs). Synthesis takes the more severe label — at 5K it breaches both the performance bar and reliability observability.
- **Constituent findings:** pwa-sw-push PWA3, performance F3.
- **Fix shape:** Drizzle unique index migration on `(user_id, endpoint)`; backfill by deleting duplicate endpoints first; switch subscribe to `onConflictDoUpdate` upsert.
- **Bar tie:** Performance bar (fan-out cost), reliability bar.
- **Effort:** M

### L19 — Notification clicks focus existing window without applying pushed deep link
- **Severity:** should-fix
- **Root cause:** `app/api/sw-script/route.ts:66-74` — when any same-origin client matches, calls `client.focus()` without `client.navigate(url)`. `clients.openWindow(url)` only runs when no client is found. `lib/notify.ts:271` shows lantern pushes carry `/?tab=...` deep links that are then ignored on focus.
- **Constituent findings:** pwa-sw-push F2.
- **Fix shape:** In `notificationclick`, resolve `data.url` against `self.location.origin`, call `client.navigate(targetUrl)` then `client.focus()` for matched clients.
- **Bar tie:** Spec / UX reliability of deep-link contract.
- **Effort:** S

### L20 — `/api/bell/active` polling is unindexed
- **Severity:** blocks-launch
- **Root cause:** `app/context/AppDataContext.tsx:79,91,110` polls `/api/bell/active` every 10s per mounted tab. `app/api/bell/active/route.ts:30-47` filters `bells` by `householdId, status, endsAt` and reads `bell_responses` by `bellId`. `lib/db/schema.ts:73,120` show `bells` and `bellResponses` have no secondary indexes. At 100-200 active users with multiple tabs, ~10-20 RPS of unindexed scans against `bells`.
- **Constituent findings:** performance F1.
- **Fix shape:** Drizzle index migration: `bells(household_id, status, ends_at)` (and possibly `(household_id, status, ends_at, created_at)`); `bell_responses(bell_id)`. Verify EXPLAIN uses them.
- **Bar tie:** Performance bar (`/api/bell/active` p95 < 500ms; expected `< 200ms`).
- **Effort:** S

### L21 — `GET /api/shifts` scopes filter on unindexed columns
- **Severity:** blocks-launch
- **Root cause:** `app/api/shifts/route.ts:64,65,68,71,73,74,89,90,114,115,122` filters on `householdId, endsAt, status, claimedByUserId, createdByUserId, preferredCaregiverId`. `lib/db/schema.ts:52` shifts table has no index callback. Caregiver "all-households" scope is the long tail per the launch bar.
- **Constituent findings:** performance F2.
- **Fix shape:** Composite indexes for actual scopes — `(household_id, ends_at, starts_at)`, `(household_id, status, ends_at, starts_at)`, `(claimed_by_user_id, ends_at)`, `(created_by_user_id, ends_at)`, `(preferred_caregiver_id, status, ends_at)`. Narrow SELECT lists after indexes are in place.
- **Bar tie:** Performance bar.
- **Effort:** M

### L22 — ICS calendar feed: unindexed `cal_token` lookup, no time bound, no caching
- **Severity:** should-fix
- **Root cause:** `app/api/shifts/ical/route.ts:58` lookups by `users.calToken` (no index in schema); :88 reads by `claimedByUserId`; :93 by `createdByUserId`; :104 maps every shift; :124 `Cache-Control: no-store`. Calendar clients poll independently; uncached full-history feeds compete with hot path.
- **Constituent findings:** performance F5.
- **Fix shape:** Unique index on `users(cal_token)` where non-null. Time-bound the feed to launch requirements (e.g., 90 days). Short cache header with ETag/last-modified validation.
- **Bar tie:** Performance bar (cost), security adjacency (unique cal_token assumption).
- **Effort:** M

### L23 — Bell POST accepts invalid and inverted time ranges
- **Severity:** blocks-launch
- **Root cause:** `app/api/bell/route.ts:21,29,38,39` checks only presence of `reason`, `startsAt`, `endsAt` then inserts `new Date(startsAt)`/`new Date(endsAt)` with no ISO-parse validation, no `start < end` check, no upper bound.
- **Constituent findings:** api-contract AP1. Note Domain 4 also flags AP6 time-range issue covering shifts and unavailability — single shared validator covers all three.
- **Fix shape:** Shared `lib/validate/time-range.ts` helper used by bell POST, shifts POST, unavailability POST. Reject non-ISO/invalid dates, `end <= start`, out-of-bounds windows with deterministic 400.
- **Bar tie:** Reliability bar (5xx < 0.1%); spec correctness.
- **Effort:** S

### L24 — Dynamic UUID route params used in DB queries without validation
- **Severity:** blocks-launch
- **Root cause:** `app/api/shifts/[id]/claim/route.ts:13,20`, `app/api/shifts/[id]/cancel/route.ts:12,15`, `app/api/bell/[id]/route.ts:13,22` read `[id]` and pass to `eq(...id, id)` queries with no UUID-shape validation. Malformed IDs surface DB cast failures as 500s.
- **Constituent findings:** api-contract AP2.
- **Fix shape:** Centralized UUID param parser returning a uniform 400 before DB access. Apply to every `[id]` API route.
- **Bar tie:** Reliability bar (5xx < 0.1%, uniform contract).
- **Effort:** S

### L25 — Family invite creation has no rate limit
- **Severity:** should-fix
- **Root cause:** `app/api/village/invite-family/route.ts:11,13,28,29` authenticates via `requireUser()`, parses body, creates token, inserts invite — no `rateLimit()` call.
- **Constituent findings:** api-contract AP4.
- **Fix shape:** Per-user rate limit via `lib/ratelimit.ts`, aligned with `/api/village/invite` limits, returning shared 429 contract.
- **Bar tie:** Security bar (rate limiting on write paths at 5K).
- **Effort:** S

### L26 — Feedback POST has no body-size cap and no rate limit
- **Severity:** blocks-launch
- **Root cause:** `app/api/feedback/route.ts:14` `await req.json()` on unbounded input; full file (37 lines) imports no rate limiter. Domain 4 AP5 framed as should-fix (contract drift); Domain 7 S3 framed as blocks-launch (DoS / DB cost). Synthesis takes the more severe label — unbounded `req.json()` on an authenticated-but-low-trust path at 5K is a viable function-blocker, and the fix cost is the same either way.
- **Constituent findings:** api-contract AP5, security-ops F3.
- **Fix shape:** Read body as text with explicit Content-Length check (reject > 16KB → 413), then `JSON.parse`. Add `rateLimit({ key: 'feedback:${user.id}', limit: 5, windowMs: 60_000 })`. Cap `message.length` to 4000 chars.
- **Bar tie:** Security bar (rate limit), reliability bar.
- **Effort:** S

### L27 — Upload validates by extension only; non-JPEG bypasses EXIF strip; blob keys deterministic + public
- **Severity:** blocks-launch
- **Root cause:** Two coupled defects in the same route. (a) `app/api/upload/route.ts:40-44` validates filename extension only; line 57 passes `file.type` (client-supplied) to `@vercel/blob.put`. `lib/strip-exif.ts:21` is JPEG-only; PNG/GIF/WebP pass through with metadata intact. (b) `app/api/upload/route.ts:53,57` constructs `homestead/${household.id}/${targetType}-${targetId}.${ext}` with `access: 'public', addRandomSuffix: false`. Public + deterministic + ID-leakable URLs = anyone who guesses the ID tuple fetches kid photos.
- **Constituent findings:** security-ops F1 + F2. Coupled because (b)'s exposure is what makes (a)'s metadata leak observable. Both fix in the same PR or the upload route is half-fixed.
- **Fix shape:** Magic-byte sniffer for the first 8 bytes (verify against extension/MIME). Extend `stripExif` to handle PNG `tEXt/iTXt/eXIf` and WebP EXIF chunks (or vendor a maintained library). Compute stored `contentType` from verified bytes. Either (a) flip blob `access` to private + auth proxy `/api/photo/[id]`, or (b) `addRandomSuffix: true` and persist URL on the row.
- **Bar tie:** Security bar (file upload + authorization).
- **Effort:** L (privacy-critical and two coupled changes)

### L28 — Sentry env vars missing from `.env.example`
- **Severity:** should-fix
- **Root cause:** `.env.example` has no `SENTRY_*` or `NEXT_PUBLIC_SENTRY_*` keys (verified by grep). `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts` exist and reference those vars. New deployments ship silent observability if vars aren't carried forward manually.
- **Constituent findings:** security-ops F5.
- **Fix shape:** Add `SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` to `.env.example` with comments. Add startup warning in `sentry.server.config.ts` if DSN unset.
- **Bar tie:** Operational readiness bar (Sentry captures unhandled errors).
- **Effort:** S

### L29 — `AppDataContext` swallows polling fetch errors with bare `catch {}`
- **Severity:** should-fix
- **Root cause:** `app/context/AppDataContext.tsx:98,134,165` bare `catch {}`. Sentry's global handlers do not see them (consumed inside `try`/`catch`). All three client polling fetches (bell, shifts, village) silently swallow 5xx.
- **Constituent findings:** security-ops F6, performance "P5" (running synthesis label only — Domain 6 listed in out-of-domain).
- **Fix shape:** In each catch, `Sentry.captureException(err)` and `console.warn` with stable tag (`[appdata:bell]`, etc.).
- **Bar tie:** Reliability bar (silent-failure rate, observability).
- **Effort:** S

### L30 — `package.json` lacks `engines` pin; `vercel.json` runs migrations before build
- **Severity:** should-fix
- **Root cause:** `grep -A2 '"engines"' package.json` returns no output. `vercel.json` `buildCommand` is `"npm run db:migrate && next build"`. Failed type-check post-migration leaves prod with new schema and old code — inverted partial deploy.
- **Constituent findings:** security-ops F7.
- **Fix shape:** Add `"engines": { "node": "22.x", "npm": "10.x" }` (match Vercel's runtime). Move migrations out of `buildCommand` to a release-phase script that runs only after build success and before traffic shift.
- **Bar tie:** Operational readiness bar (build reproducible).
- **Effort:** M

## Domain-by-domain mapping

| Domain finding | Synthesized as |
|---|---|
| auth-access F1 | L1 |
| auth-access F2 | L2 |
| auth-access F3 | L3 |
| auth-access F4 | L4 |
| auth-access F5 | L6 |
| auth-access F6 | L7 |
| auth-access F7 | L8 |
| (auth-access running-synth A4 — IDOR) | L5 |
| data-integrity F1 | L2 + L9 (split: L2 covers village delete, L9 covers household-members delete; both share tombstone-service fix) |
| data-integrity F2 | L10 |
| data-integrity F3 | L11 |
| data-integrity F4 | L12 |
| notifications-observability F1 | L13 |
| notifications-observability F2 | L10 |
| notifications-observability F3 | L14 |
| notifications-observability F4 | L16 |
| notifications-observability F5 | L17 |
| api-contract AP1 | L23 |
| api-contract AP2 | L24 |
| api-contract AP3 | L4 |
| api-contract AP4 | L25 |
| api-contract AP5 | L26 |
| api-contract AP6 | L8 |
| api-contract AP7 | L1 |
| pwa-sw-push PWA1 | L13 |
| pwa-sw-push PWA2 | L19 |
| pwa-sw-push PWA3 | L18 |
| performance F1 | L20 |
| performance F2 | L21 |
| performance F3 | L18 |
| performance F4 | L15 |
| performance F5 | L22 |
| security-ops F1+F2 | L27 |
| security-ops F3 | L26 |
| security-ops F4 | L14 |
| security-ops F5 | L28 |
| security-ops F6 | L29 |
| security-ops F7 | L30 |

## Severity reconciliations

Three findings had severity disagreement across domains. Resolutions:

1. **L4 (admin authority divergence)** — auth-access F4 (should-fix) vs. api-contract AP3 (blocks-launch). Resolved as **blocks-launch**: the existence of `app/api/household/admin/route.ts` proving `isAdmin` is the contract makes the divergence a clear security-bar break, not a quality regression. Foundational for L2/L3.
2. **L18 (push subscription dedupe)** — pwa-sw-push PWA3 (should-fix) vs. performance F3 (blocks-launch). Resolved as **blocks-launch**: the 5K fan-out math (10 bells/min × 2-10 recipients × N duplicate subs) breaches both the performance and reliability bars; the correctness framing alone might be should-fix, but cost amplification at saturation tips it.
3. **L26 (feedback unbounded body)** — api-contract AP5 (should-fix) vs. security-ops F3 (blocks-launch). Resolved as **blocks-launch**: unbounded `req.json()` on an authenticated-but-low-trust path is a function-blocker at 5K; fix cost is the same regardless of framing.

## Cross-domain themes (for fix-batch shaping)

These themes group consolidated findings into natural fix batches for Phase 4:

- **Theme A — Admin authority + village authz (foundation):** L4 (helper) → L2, L3, L5, L7. Single helper unblocks four downstream fixes.
- **Theme B — Soft-delete + FK safety:** L9 (tombstone service) → reused in L2's delete path. Pairs with `account/route.ts` already-correct pattern.
- **Theme C — Anonymous + GET-mutation invite path:** L1. Standalone but adjacent to Theme A (auth helpers).
- **Theme D — Village-group enum migration completion:** L10 (server) + (parts of L13's eligible-set correctness).
- **Theme E — Lantern silent-success (server + client):** L13 + L29 (observability) + L16 (logging) — coordinated, server-then-client.
- **Theme F — Cron wiring + escalation safety:** L14 (config) + L15 (batching/index). Sequential — L14 first, L15 immediately after to avoid backlog blast.
- **Theme G — Push subscription correctness + cost:** L18 (uniqueness) + L17 (pruning) + L19 (deep link).
- **Theme H — DB indexing pass:** L20 (bell-active) + L21 (shifts) + L22 (ical) + L15's index. Single migration PR.
- **Theme I — Validation contract:** L23 (time-range) + L24 (UUID) + L8 (error keys) + L25, L26 (rate limits).
- **Theme J — Upload security (privacy-critical):** L27 standalone, two coupled changes.
- **Theme K — Schema authority + ops:** L11, L12, L28, L30.

## Spec gates flagged once for completeness (out of audit scope per `launch-readiness-5k.md`)

Per the bar's "Out-of-scope" section, these are tracked on `Apps/Homestead/TODO.md` and not enumerated as audit findings: Insurance, ToS / Privacy Policy, COVEY trademark clearance, Clerk dev → prod key migration, joincovey.co DNS / custom domain, Resend domain verification. Synthesis confirms none of the consolidated findings (L1–L30) require these to land first.

## What synthesis did not check

- Production `information_schema` and `drizzle.__drizzle_migrations` (Domain 2 explicitly noted this; synthesis carries that limit forward).
- Live VAPID env values in production.
- Browser-automated PWA install verification.
- Load-test confirmation of p95 estimates.
- Full XSS sweep — Domain 7 sampled `dangerouslySetInnerHTML` and found none in the components scanned, but the sweep was not exhaustive.

These belong to a pre-launch staging pass after the fix batches land, not to this audit.
