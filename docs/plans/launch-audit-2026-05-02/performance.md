---
title: Launch audit — Performance and cost at 5K households
date: 2026-05-02
domain: Domain 6 — Performance and cost at 5K households
auditor: codex
---

## Summary

I read the launch bar, prompt template, Domain 6 charter, schema/migrations, and the hot bell, push, shift, cron, ICS, diagnostics, and polling call sites. The main launch risk is not one slow line of code; it is that the most frequent queries and push fan-out paths run without supporting secondary indexes or database-enforced dedupe. I stayed within the 25-file read cap and did not start fix work.

## Findings

### Finding 1 — `/api/bell/active` polling is backed by unindexed bell/response lookups
- **Severity:** blocks-launch
- **Root cause (falsifiable):** `AppDataProvider` polls `/api/bell/active` every 10 seconds per mounted tab, while the route filters `bells` by `household_id`, `status`, and `ends_at` and reads `bell_responses` by `bell_id`, but the Drizzle schema defines those columns without secondary indexes.
- **Evidence:** `app/context/AppDataContext.tsx:79` — `BELL_POLL_MS = 10_000`; `app/context/AppDataContext.tsx:91` — fetches `/api/bell/active`; `app/context/AppDataContext.tsx:110` — starts the interval; `app/api/bell/active/route.ts:30` — `db.select().from(bells)`; `app/api/bell/active/route.ts:32` — filters by `bells.householdId`; `app/api/bell/active/route.ts:33` — filters by `bells.status`; `app/api/bell/active/route.ts:34` — filters by `bells.endsAt`; `app/api/bell/active/route.ts:47` — reads `bellResponses` by `bellId`; `lib/db/schema.ts:73` — `bells` table has no index callback; `lib/db/schema.ts:120` — `bellResponses` table has no index callback.
- **Why it matters at 5K:** At 100-200 active users, visible tabs generate roughly 10-20 `/api/bell/active` requests per second, so an unindexed scan on the route with a 500ms p95 bar can become the dominant DB cost even when no bell is ringing.
- **Proposed fix (root cause):** Add Drizzle index definitions and a migration for the exact access patterns, for example `bells(household_id, status, ends_at, created_at)` and `bell_responses(bell_id)`, then keep the route query aligned with those predicates.
- **Regression test:** Add `tests/perf-indexes.test.ts` that introspects generated Drizzle metadata or a test database and asserts the bell-active indexes exist before the route is considered launch-ready.
- **Effort:** S
- **Cross-references:** Prior D4 hot-path work; this is the performance framing for the same endpoint.

### Finding 2 — Shift list scopes use unindexed long-tail predicates and joins
- **Severity:** blocks-launch
- **Root cause (falsifiable):** `GET /api/shifts` builds `village`, `mine`, `all`, and household queries over `shifts.household_id`, `ends_at`, `status`, `claimed_by_user_id`, `created_by_user_id`, and `preferred_caregiver_id`, but the `shifts` table has no secondary indexes for those predicates.
- **Evidence:** `app/api/shifts/route.ts:64` — `village` scope filters by `shifts.householdId`; `app/api/shifts/route.ts:65` — filters by `shifts.endsAt`; `app/api/shifts/route.ts:68` and `app/api/shifts/route.ts:71` — filters by `shifts.status`; `app/api/shifts/route.ts:73` and `app/api/shifts/route.ts:74` — filters by `preferredCaregiverId`; `app/api/shifts/route.ts:89` and `app/api/shifts/route.ts:90` — `mine` scope filters claimed/created user IDs; `app/api/shifts/route.ts:114` and `app/api/shifts/route.ts:115` — household scope filters household and end time; `app/api/shifts/route.ts:122` — selects full `shift: shifts`; `lib/db/schema.ts:52` — `shifts` table has no index callback.
- **Why it matters at 5K:** The launch bar explicitly calls caregiver all-households scope the long tail for `GET /api/shifts`; without indexes, 10-20K users and accumulated shift history push this endpoint toward full scans and p95 misses.
- **Proposed fix (root cause):** Add composite indexes around the actual scopes, such as `(household_id, ends_at, starts_at)`, `(household_id, status, ends_at, starts_at)`, `(claimed_by_user_id, ends_at)`, `(created_by_user_id, ends_at)`, and `(preferred_caregiver_id, status, ends_at)`; narrow the selected columns only after the indexes are in place.
- **Regression test:** Add `tests/perf-shifts-indexes.test.ts` that verifies required indexes exist and add a query-shape unit test for each scope so future predicate changes update the index contract.
- **Effort:** M
- **Cross-references:** D4 API findings AP1-AP7 may touch this route; this finding is limited to p95/cost.

### Finding 3 — Push subscription dedupe is not enforced, multiplying every bell fan-out
- **Severity:** blocks-launch
- **Root cause (falsifiable):** `push_subscriptions` has no unique constraint on `(user_id, endpoint)`, and `/api/push/subscribe` implements a read-then-insert upsert that can create duplicate rows under retries or concurrent registration.
- **Evidence:** `lib/db/schema.ts:88` — `pushSubscriptions` table starts without a unique callback; `lib/db/schema.ts:90` and `lib/db/schema.ts:92` — `userId` and `endpoint` are plain columns; `app/api/push/subscribe/route.ts:22` — comment says upsert by endpoint; `app/api/push/subscribe/route.ts:23` — reads existing rows; `app/api/push/subscribe/route.ts:31` — inserts when none are observed; `lib/push.ts:150` — bell fan-out selects all matching subscription rows; `lib/push.ts:66` — sends one network request per returned row.
- **Why it matters at 5K:** With expected 10 bells/minute, 2-10 recipients, and 1-3 legitimate subscriptions per user, the expected fan-out is already 20-300 push attempts/minute; duplicate rows turn that into an unbounded multiplier inside `POST /api/bell` latency and push-provider cost.
- **Proposed fix (root cause):** Add a unique index on `(user_id, endpoint)` or `(household_id, user_id, endpoint)` and change subscribe to a database-native `onConflictDoUpdate` upsert; backfill by deleting duplicate endpoints before applying the constraint.
- **Regression test:** Add `tests/push-subscribe-dedupe.test.ts` that posts the same endpoint twice and concurrently, then asserts one row and one push attempt per endpoint.
- **Effort:** M
- **Cross-references:** PWA3; this is the performance/cost consequence of the same root cause.

### Finding 4 — Bell cron escalation can process an unbounded backlog concurrently
- **Severity:** should-fix
- **Root cause (falsifiable):** `/api/bell/cron` selects every due ringing bell with no limit and then runs `escalateBell` for every row through `Promise.allSettled`.
- **Evidence:** `app/api/bell/cron/route.ts:14` — `db.select().from(bells)`; `app/api/bell/cron/route.ts:16` — filters `status = ringing`; `app/api/bell/cron/route.ts:17` — filters `escalatedAt IS NULL`; `app/api/bell/cron/route.ts:18` — filters `createdAt <= fiveMinutesAgo`; `app/api/bell/cron/route.ts:21` — starts `Promise.allSettled`; `app/api/bell/cron/route.ts:22` — maps every due bell into `escalateBell`; `lib/bell-escalation.ts:11` — each bell performs an extra select; `lib/bell-escalation.ts:15` — then an update; `vercel.json:1` — config exists; `vercel.json:2` — only `buildCommand` is configured, no cron schedule is present.
- **Why it matters at 5K:** If N3 is fixed and the cron starts firing after any outage/backlog, one request can fan out DB reads, updates, and field-tier push sends for every stale bell, breaching p95 and risking Vercel function timeouts.
- **Proposed fix (root cause):** Wire the cron intentionally, then batch due bells with a bounded `limit`, add the matching index `(status, escalated_at, created_at)`, and process with a small concurrency cap or a single SQL update-returning batch before notifying.
- **Regression test:** Add `tests/bell-cron-batching.test.ts` that seeds more due bells than the batch size and asserts one cron invocation processes at most that limit and does not start more than the configured concurrency.
- **Effort:** M
- **Cross-references:** N3; this finding assumes the cron becomes reachable.

### Finding 5 — Calendar feed token and shift queries are unindexed and uncached
- **Severity:** should-fix
- **Root cause (falsifiable):** The token-authenticated ICS route looks up users by `cal_token`, reads all claimed or posted shifts for that user without a time bound, and returns `Cache-Control: no-store`, while `cal_token`, `claimed_by_user_id`, and `created_by_user_id` have no supporting indexes in the schema.
- **Evidence:** `app/api/shifts/ical/route.ts:58` — token path filters by `users.calToken`; `app/api/shifts/ical/route.ts:88` — caregiver feed reads shifts by `claimedByUserId`; `app/api/shifts/ical/route.ts:93` — parent feed reads shifts by `createdByUserId`; `app/api/shifts/ical/route.ts:104` — maps every returned shift into an ICS event; `app/api/shifts/ical/route.ts:124` — response uses `Cache-Control: no-store`; `lib/db/schema.ts:36` — `calToken` is a plain text column; `lib/db/schema.ts:52` — `shifts` table has no index callback.
- **Why it matters at 5K:** Calendar clients poll feed URLs independently of active web sessions, so uncached full-history feeds can create recurring background DB load that competes with the bell and shift p95 bars.
- **Proposed fix (root cause):** Add a unique index on `users(cal_token)` where non-null, add user/time indexes for feed queries, bound the feed window to launch requirements, and return a short cache header with ETag or last-modified validation.
- **Regression test:** Add `tests/ical-feed-perf-contract.test.ts` that asserts the token index exists, the route excludes shifts outside the configured window, and the response is cacheable.
- **Effort:** M
- **Cross-references:** Domain 7 owns ICS authentication exposure; this finding is only about cost.

## Out-of-domain observations

- `app/context/AppDataContext.tsx:98` and `app/context/AppDataContext.tsx:134` swallow polling/fetch errors without logging; Domain 3 may already own the observability framing.
- `app/api/shifts/ical/route.ts:64` dynamically imports Clerk auth inside the non-token path; this is not a hot path compared with bell polling, but Domain 7 may want to review route auth and bundle behavior.
- `vercel.json:2` has no cron schedule, matching N3; this audit only characterized the performance impact if it is wired.

## What I did not check

I did not run database `EXPLAIN` plans or load tests, because the task asked for static repo audit only. I did not read every app route or every prior-domain artifact; findings above are grounded only in the files cited. I did not inspect production row counts beyond the diagnostics code path, so the scale estimates use the launch-readiness assumptions.
