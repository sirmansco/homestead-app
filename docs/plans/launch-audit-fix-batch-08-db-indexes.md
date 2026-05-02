---
title: Launch fix batch 08 — DB indexing pass
date: 2026-05-02
status: pending
governs: L20, L21, L22
parent-audit: docs/plans/launch-audit-2026-05-02/synthesis.md
batch-id: B8
prereqs: none (independent migration)
unblocks: none
---

## Spec

A single Drizzle migration adds the indexes the hot paths need to hold p95 < 800ms (and `/api/bell/active` < 500ms) at 100–200 concurrent users.

1. **L20** — `bells(household_id, status, ends_at)` covers `/api/bell/active` filter at `app/api/bell/active/route.ts:30-34`. `bell_responses(bell_id)` covers the join at line 47.
2. **L21** — `shifts` composites for actual scopes: `(household_id, ends_at, starts_at)`, `(household_id, status, ends_at, starts_at)`, `(claimed_by_user_id, ends_at)`, `(created_by_user_id, ends_at)`, `(preferred_caregiver_id, status, ends_at)`.
3. **L22** — `users(cal_token)` partial index `WHERE cal_token IS NOT NULL` for ICS feed token lookup.

The B6 cron index `bells(status, escalated_at, created_at)` is intentionally separate (it ships with B6 because the LIMIT/concurrency change without the index is half a fix).

**Done criteria:** Migration ships. `EXPLAIN` against representative queries shows index usage (verify in staging if available; otherwise document the expected plan in the migration comments). No production rollback required — `CREATE INDEX CONCURRENTLY` (or Drizzle equivalent for the migration tool used). Regression test introspects schema and asserts the indexes exist.

**Out of scope:** Selecting narrower columns from `/api/shifts` (recommended by Domain 6 but a separate cleanup); ICS time-bound + caching headers (B11 / L22 fix-shape part 2 — see below).

## Conventions

Pattern scan:
- Drizzle table-level callback in `lib/db/schema.ts` declares indexes via `(t) => ({ name: index('name').on(t.col) })` style.
- Migration file naming follows `drizzle/00XX_descriptive_name.sql`.
- The codebase has no current indexes beyond unique constraints (per Domain 6 evidence at lines 73, 120, 52); this batch is the first index pass.

## File map

- `lib/db/schema.ts` — add table-level index callbacks for `bells`, `bellResponses`, `shifts`, `users`.
- `drizzle/00XX_hot_path_indexes.sql` — generated migration.
- `tests/perf-indexes.test.ts` — assert each named index exists in the schema metadata.

## Graveyard

(empty)

## Anchors

- `users_clerk_user_household_unique` constraint — must remain.
- B6 escalation index — independent, do not duplicate here.
- B7 `push_subscriptions(user_id, endpoint)` unique — independent, do not duplicate here.

## Fragile areas

- `CREATE INDEX CONCURRENTLY` requires running outside a transaction. Drizzle migrations may default to transactional; verify the migration mechanism supports concurrent index creation, or schedule the migration during a low-traffic window.
- Index choice on `shifts` is broad. Re-evaluate by `EXPLAIN ANALYZE` once representative data exists; some of the proposed five may be redundant.
- The L22 ICS time-bound and caching headers are deferred — note in the plan that without them, even the indexed feed remains uncached. Track as follow-up.

## Regression tests required (Hard Rule #6)

- `tests/perf-indexes.test.ts` — schema-introspection assertions. Optionally extend with a query-shape unit test for each scope so future predicate changes surface a CI failure that prompts an index update.
