---
title: Launch fix batch 07 — DB indexing pass
date: 2026-05-02
status: pending
governs: L20, L21, L22
parent-audit: docs/plans/launch-audit-2026-05-02/synthesis.md
batch-id: B7
prereqs: none (independent; snapshot chain intact at 0009)
unblocks: none
---

## Spec

A single Drizzle migration (0010) adds secondary indexes for the three hot-path surfaces identified in synthesis Theme H. Goal: hold p95 ≤ 800ms at 100–200 concurrent users on the query paths that poll every 10s or run on every calendar-app pull.

**L20 — `/api/bell/active` (blocks-launch)**
Route at `app/api/bell/active/route.ts:30-34` filters `bells` by `(householdId, status IN ('ringing','handled'), endsAt > now)` and then fetches `bellResponses` by `(bellId IN ...)`.
- New index: `bells(household_id, status, ends_at)` — covers the primary filter; planner can index-scan rather than seq-scan the whole `bells` table per polling tick.
- New index: `bell_responses(bell_id)` — covers the bellId fan-in at route line 47.
- Note: `bells` already has `idx_bells_status_escalated_created` from B4 (0007); the new `household_id` prefix makes the active-poll predicate efficient. These are non-conflicting.

**L21 — `GET /api/shifts` (blocks-launch)**
Route at `app/api/shifts/route.ts:56-133` has four scopes, each landing on distinct filter predicates against `shifts`:

| scope | key predicates |
|---|---|
| `household` | `household_id = X, ends_at >= now` |
| `village` | `household_id IN (...), ends_at >= now, status = 'open'/'claimed'` |
| `mine` | `claimed_by_user_id IN (...) OR created_by_user_id IN (...), ends_at >= now` |
| `all` | multi-clause OR across household_id sets, ends_at >= now |

Indexes:
- `shifts(household_id, ends_at, starts_at)` — covers `household` and `all`-parent-clause.
- `shifts(household_id, status, ends_at, starts_at)` — covers `village` scope's status predicate; planner picks between this and the above.
- `shifts(claimed_by_user_id, ends_at)` — covers `mine` and caregiver claimed-shifts.
- `shifts(created_by_user_id, ends_at)` — covers `mine` created-by branch.
- `shifts(preferred_caregiver_id, status, ends_at)` — covers preferred-caregiver-targeted lookup.

Five indexes. The synthesis acknowledges some may prove redundant once `EXPLAIN ANALYZE` runs against real data; all five ship now and a staging EXPLAIN pass (pre-launch) will prune.

**L22 — `/api/shifts/ical` (should-fix)**
Route at `app/api/shifts/ical/route.ts:58` looks up `users` by `calToken` (no index). Every calendar app poll hits this as a seq-scan on `users`.
- New partial unique index: `users(cal_token) WHERE cal_token IS NOT NULL` — lookup becomes O(log n) and the unique constraint is enforced at the DB level.
- Note: time-bound (90-day window) and `Cache-Control` / ETag headers are **out of scope** for this batch per synthesis line 208; tracked as a follow-up in Fragile areas §3.

**Done criteria (falsifiable):**
- `db:generate` produces a single clean 0010 migration with only index-creation statements (no extra ALTERs — indicator that snapshot chain is intact).
- `tests/perf-indexes.test.ts` schema-grep assertions pass for all named indexes.
- Zero new lint problems vs. main.
- `db:doctor` clean.

**Out of scope:**
- Narrowing SELECT lists in `/api/shifts` (Domain 6 recommendation; separate cleanup batch).
- ICS time-bound + caching headers (Fragile area §3).
- `CREATE INDEX CONCURRENTLY` — Drizzle migration runner wraps in a transaction; CONCURRENTLY is incompatible with transactions. Standard `CREATE INDEX` is acceptable at current table sizes; schedule migration during low-traffic window or off-peak deploy if row counts have grown.

## Conventions

Pattern scan against `lib/db/schema.ts`, `drizzle/0007_bells_escalation_index.sql`, migration journal:

- **Index declaration:** `index('idx_<table>_<col1>_<col2>').on(t.col1, t.col2)` inside the table's `(t) => ({ ... })` callback. Only one live example (`idx_bells_status_escalated_created` in `bells` at schema.ts:87) — match that style exactly.
- **`index` import:** already present in the `drizzle-orm/pg-core` import at schema.ts:1. Do not re-import; do not add `pgIndex` or any alias.
- **Partial indexes:** Drizzle ORM supports `.where(sql\`...\`)` on the `index(...)` builder. Use `index(...).on(t.calToken).where(sql\`cal_token IS NOT NULL\`)` for L22; import `sql` from `drizzle-orm` (already used elsewhere in the project).
- **Unique indexes (for contrast):** `unique('name').on(t.col)` — already present in `pushSubscriptions` and `users`. Not the pattern here; L20/L21/L22 are plain performance indexes, not constraints.
- **Migration file naming:** `drizzle/00XX_descriptive_name.sql`; next slot is `0010`. Name: `0010_hot_path_indexes.sql`.
- **Resource-fork preflight (macOS lesson from lessons.md 2026-05-02):** before running the second `db:generate` integrity check, run `find drizzle/meta -name '._*' -delete`. APFS creates binary `._` forks alongside any file the kit writes; the kit's directory walk hits them first and crashes the JSON parser.
- **Snapshot chain integrity check:** after `db:generate`, run it a second time and confirm "No schema changes, nothing to migrate." If the second run emits extra ALTERs, the snapshot chain is broken — do not strip the output, fix the chain (lessons.md).
- **Migration content pattern** (from 0007): plain `CREATE INDEX "name" ON "table" USING btree ("col1","col2");` — Drizzle kit generates btree by default. Do not hand-write the SQL; generate it. Verify the output contains only index-creation statements.

## File map

| File | Change |
|---|---|
| `lib/db/schema.ts` | Add index callbacks to `bells`, `bellResponses`, `shifts`, `users` tables |
| `drizzle/0010_hot_path_indexes.sql` | Generated migration — do not hand-write |
| `drizzle/meta/0010_snapshot.json` | Generated snapshot — must be committed alongside the SQL (snapshot lesson) |
| `tests/perf-indexes.test.ts` | New test — schema-grep assertions for all named indexes |

No other files. Any change touching a file outside this list is a scope-creep interrupt per Protos §4.

## Graveyard

(empty — session start)

## Anchors

- `idx_bells_status_escalated_created` (B4, 0007) — must not be duplicated or dropped.
- `push_subscriptions_user_endpoint_unique` constraint (B6, 0009) — independent, untouched.
- `users_clerk_user_household_unique` constraint — must remain.
- 230/230 tests green on main (SHIPLOG B6) — full suite must remain green.

## Fragile areas

**§1 — Multiple indexes on `shifts` may generate noisy EXPLAIN plans.** Postgres's planner will pick one index per table scan; with five indexes on `shifts`, a staging `EXPLAIN ANALYZE` may show some as redundant (e.g., the two household-prefix indexes may be substitutable). Resolution: ship all five, verify in staging before launch, prune in a follow-up migration if clearly redundant. Do not prune pre-emptively.

**§2 — `bells` already has a non-trivial index.** `idx_bells_status_escalated_created` covers `(status, escalated_at, created_at)`. The new `bells(household_id, status, ends_at)` has a different leading column (`household_id` vs `status`). The cron query filters `status = 'ringing' AND escalated_at IS NULL` — unaffected by the new index. The `/api/bell/active` filter uses `householdId` as the leading equality predicate, which the existing index doesn't cover. These are non-conflicting; the planner will use each index for its respective query shape.

**§3 — L22 ICS time-bound and caching deferred.** Without a `WHERE endsAt >= now - interval '90 days'` time bound and a `Cache-Control: max-age=3600` / ETag header, the ICS feed remains uncached and reads the full shift history on every calendar-app poll. The index makes the `calToken` lookup fast, but the shifts query itself is still unbounded. Mark as a follow-up batch (Theme K scope or standalone).

**§4 — `CREATE INDEX` vs. `CREATE INDEX CONCURRENTLY`.** Standard `CREATE INDEX` (what the kit generates) takes a `ShareLock` that blocks writes for the duration of the build. At current table sizes (< 10K rows in dev) this is sub-second. If production has grown significantly, schedule the deploy during off-peak. If needed, the SQL can be manually amended to `CREATE INDEX CONCURRENTLY` and run outside the migration runner — document this decision in the PR if taken.

## Regression test plan (Hard Rule #6)

**`tests/perf-indexes.test.ts`** — schema-source-grep assertions:

For each named index, assert:
- The `index('...')` call with the exact name string appears in `schema.ts` (falsifiable: rename the index → test red).
- The `.on(t.col1, ...)` columns appear in the correct order immediately after the name (falsifiable: reorder columns → test red).
- The generated SQL file `drizzle/0010_hot_path_indexes.sql` exists and contains the `CREATE INDEX` statement for each name (falsifiable: delete the file → test red).

Index names to assert:
- `idx_bells_household_status_ends_at`
- `idx_bell_responses_bell_id`
- `idx_shifts_household_ends_at_starts_at`
- `idx_shifts_household_status_ends_at_starts_at`
- `idx_shifts_claimed_by_ends_at`
- `idx_shifts_created_by_ends_at`
- `idx_shifts_preferred_caregiver_status_ends_at`
- `idx_users_cal_token` (partial — assert the `WHERE cal_token IS NOT NULL` clause is present in the SQL)

Each assertion is one `expect(source).toContain(...)` line. No DB connection required; test is a source-grep suite matching the pattern established in `tests/migrations-snapshot.test.ts` and `tests/push-dedup-migration.test.ts`.

Falsifiability proof required before merge: remove one index from `schema.ts`, confirm that test goes red, restore. Document the specific test + index that was reverified in the PR Verification section.
