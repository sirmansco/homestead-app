---
title: Launch fix batch 04 — Complete village-group enum migration
date: 2026-05-02
status: pending
governs: L10
parent-audit: docs/plans/launch-audit-2026-05-02/synthesis.md
batch-id: B4
prereqs: none (independent)
unblocks: B5 (lantern eligible-set correctness), B6 (cron escalation queries)
---

## Spec

After this batch, no code path inserts `inner_circle` or `sitter` into `users.villageGroup`. Existing rows with legacy values are backfilled to `covey`/`field`. Notification queries continue to work for both old and new values during a transitional read-compat window; old enum labels are removed from the Postgres enum after a verified zero-row count.

Concretely:
1. Add `lib/village-group/normalize.ts` exporting `normalizeVillageGroup(value: string | null | undefined): 'covey' | 'field'`. Maps `inner_circle → covey`, `sitter → field`. Default `'field'` for unknown.
2. Wire normalize at every write boundary: `lib/auth/household.ts:55` (auto-provision), `app/api/bell/[id]/respond/route.ts:60` (bell-respond auto-create), any other Clerk-metadata-driven insert.
3. Backfill migration: `UPDATE users SET village_group = 'covey' WHERE village_group = 'inner_circle'; UPDATE users SET village_group = 'field' WHERE village_group = 'sitter';`.
4. Read-compat shim: while old values may still be in `information_schema.enum_range`, read filters at `lib/notify.ts:257-264` and `:286-293` use `IN ('covey','inner_circle')` for inner-circle and `IN ('field','sitter')` for field. Document that this is transitional.
5. Once a follow-up doctor check confirms zero rows with old values for ≥7 days, remove old enum labels via Drizzle migration; remove the read-compat shim.

**Done criteria for THIS batch:** Steps 1–4 land. Doctor check (B11/L12) reports zero rows with `inner_circle`/`sitter`. Old enum labels removed in a follow-up plan (not B4).

**Out of scope:** Doctor coverage expansion (B11/L12); enum-label removal Drizzle migration (follow-up).

## Conventions

Pattern scan (`lib/auth/household.ts`, `app/api/bell/[id]/respond/route.ts`):
- Clerk metadata is typed at `lib/auth/household.ts:40` as a union including old + new values.
- Drizzle migrations live under `drizzle/` with sequential numeric prefixes; backfill SQL ships as its own migration file.
- `lib/notify.ts` filter pattern is `eq(users.villageGroup, 'covey')` — change to `inArray(users.villageGroup, ['covey','inner_circle'])` for the transitional shim.

## File map

- `lib/village-group/normalize.ts` — new file.
- `lib/auth/household.ts:55` — wrap `meta.villageGroup` insert with `normalizeVillageGroup()`.
- `app/api/bell/[id]/respond/route.ts:60` — same.
- Other Clerk-metadata insert sites — `grep -rn "villageGroup" app/api/ lib/` and apply.
- `drizzle/00XX_village_group_backfill.sql` — new migration. Only `UPDATE` statements; no schema change.
- `lib/notify.ts:257-264, 286-293` — switch to `inArray` shim with comment referencing this plan and a TODO date for shim removal.
- `tests/village-group-normalization.test.ts` — assert: Clerk metadata `inner_circle` persists as `covey`; `notifyBellRing()` includes legacy and normalized rows during shim window.

## Graveyard

(empty)

## Anchors

- `drizzle/0005_enum_backfill.sql` already documents the migration history; don't conflict with it.
- `lib/db/schema.ts:6` enum definition — leave untouched in this batch.

## Fragile areas

- Production Clerk dashboard may still emit old metadata values for new invites if an admin manually set them. Recommend a Clerk dashboard audit alongside this batch (operational, not code).
- Spec NN around village-group naming — confirm the rename is final before code-locking the union narrows.

## Regression tests required (Hard Rule #6)

- `tests/village-group-normalization.test.ts` — assert that both `requireHousehold()` and bell-respond auto-create persist `covey`/`field` when fed `inner_circle`/`sitter`; assert that the lantern eligible set during the shim window still includes legacy rows.
