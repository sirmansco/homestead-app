---
title: Launch audit — data-integrity
date: 2026-05-02
domain: data-integrity
auditor: codex
---

## Summary

I read the launch bar, audit template, domain map, Domain 2 seed files, all checked-in SQL migrations, migration journal, DB drift checker, account/member deletion routes, and the two village overlap routes. The schema does enforce `(clerkUserId, householdId)` uniqueness in both Drizzle and baseline SQL, and the repo journal now includes `0001_notification_prefs`; I could not verify live production `information_schema` or `drizzle.__drizzle_migrations` from this sandbox. I found four data-integrity issues: user-delete routes can hit FK restrict as 5xx instead of a safe block, legacy enum values can still be written, stale raw migration scripts bypass Drizzle, and the drift checker does not prove the full schema/journal bar.

## Findings

### Finding 1 — Member delete routes can turn FK restrict into 5xx instead of a safe block
- **Severity:** blocks-launch
- **Root cause (falsifiable):** Village/member DELETE handlers directly delete `users` rows even though historical `shifts.created_by_user_id` and `bells.created_by_user_id` are `ON DELETE restrict`, so a member with created history fails through generic error handling instead of being tombstoned or blocked with a clear 4xx.
- **Evidence:** `lib/db/schema.ts:55` — `shifts.createdByUserId` references `users.id` with `onDelete: 'restrict'`; `lib/db/schema.ts:76` — `bells.createdByUserId` references `users.id` with `onDelete: 'restrict'`; `app/api/household/members/[id]/route.ts:53` — member DELETE directly calls `db.delete(users)`; `app/api/village/route.ts:98` — village adult DELETE directly calls `db.delete(users)`; `app/api/account/route.ts:120` — account deletion acknowledges past created rows must be preserved by tombstoning instead of deleting.
- **Why it matters at 5K:** The data-integrity bar requires deletes on `users` to cascade safely or be blocked with a clear 4xx; at launch scale, removing any caregiver/parent with historical bells or shifts becomes a user-visible 5xx path.
- **Proposed fix (root cause):** Centralize user-profile removal behind one service that checks created shifts/bells before deletion, tombstones rows with history using the account-deletion anonymization path, and returns an explicit 409/4xx when a hard delete is not allowed.
- **Regression test:** Add `tests/user-delete-fk-safety.test.ts` asserting household member/village adult DELETE on a user with created shifts or bells returns a clear non-5xx response and leaves historical rows valid.
- **Effort:** M
- **Cross-references:** Domain 1 A2 (`/api/village/route.ts` member CRUD auth gap) and Domain 2 account-deletion concurrency scope.

### Finding 2 — Legacy village enum values can still be written after the Covey backfill
- **Severity:** should-fix
- **Root cause (falsifiable):** User auto-create paths accept Clerk `publicMetadata.villageGroup` values of `inner_circle` and `sitter` and insert them directly, while the current launch charter says the `inner_circle`/`sitter` to `covey`/`field` migration must be fully landed with no straggler literals.
- **Evidence:** `lib/db/schema.ts:6` — `village_group` still includes `inner_circle` and `sitter`; `lib/auth/household.ts:40` — Clerk metadata type includes `inner_circle` and `sitter`; `lib/auth/household.ts:55` — `meta.villageGroup` is written directly to `users.villageGroup`; `app/api/bell/[id]/respond/route.ts:53` — bell response auto-create also accepts old metadata values; `app/api/bell/[id]/respond/route.ts:60` — that value is inserted directly; `drizzle/0005_enum_backfill.sql:4` — migration comments document old Clerk metadata as the reason old enum values remain.
- **Why it matters at 5K:** The bar requires the enum migration to be fully landed; continued writes of legacy values recreate drift after the backfill and make production row state depend on stale Clerk invitation metadata.
- **Proposed fix (root cause):** Add a single `normalizeVillageGroup()` helper used before every DB insert/update from Clerk or request metadata, mapping `inner_circle -> covey` and `sitter -> field`, while leaving old Postgres enum labels only as a temporary read compatibility layer until a zero-row verification allows removal.
- **Regression test:** Add `tests/village-group-normalization.test.ts` asserting both `requireHousehold()` and bell response auto-create store `covey`/`field` when Clerk metadata contains `inner_circle`/`sitter`.
- **Effort:** S
- **Cross-references:** Domain 3 notification recipient filters should confirm no old enum values are used for recipient eligibility.

### Finding 3 — Raw schema-mutating migration scripts bypass Drizzle and are stale
- **Severity:** should-fix
- **Root cause (falsifiable):** `scripts/migrate-*.ts` directly create or alter production schema outside `drizzle/` and the journal, and at least two scripts no longer match `lib/db/schema.ts`.
- **Evidence:** `../docs/specs/homestead.md:176` — spec says raw SQL belongs only in migrations; `scripts/migrate-kids.ts:9` — creates `kids` outside Drizzle; `scripts/migrate-kids.ts:15` — the script's `kids` table stops at `created_at`, while `lib/db/schema.ts:48` defines `kids.photoUrl`; `scripts/migrate-shifts.ts:13` — creates `shifts` outside Drizzle; `scripts/migrate-shifts.ts:26` — the script's `shifts` table stops at `created_at`, while `lib/db/schema.ts:57` and `lib/db/schema.ts:66` define additional current columns; `scripts/migrate-users-unique.ts:11` — adds the composite unique constraint outside a Drizzle migration.
- **Why it matters at 5K:** The launch bar says Drizzle schema and migrations are the source of truth; stale out-of-band schema scripts can create orphan/missing columns and journal drift that Drizzle will not record.
- **Proposed fix (root cause):** Delete or quarantine one-off schema scripts after replacing any still-needed operation with checked-in Drizzle migrations, and make production migration entrypoints run only `drizzle-kit`/the journaled migration flow plus `db:doctor`.
- **Regression test:** Add `tests/schema-migration-entrypoints.test.ts` asserting no `scripts/migrate-*.ts` files contain `CREATE TABLE`, `ALTER TABLE`, or other schema DDL outside `drizzle/`.
- **Effort:** S
- **Cross-references:** Operational readiness migration-journal checks.

### Finding 4 — Drift checker does not verify the full schema authority bar
- **Severity:** should-fix
- **Root cause (falsifiable):** `scripts/doctor.ts` only samples four tables for required columns and checks missing expected columns, so it cannot prove there are no orphan columns, missing constraints, or missing FKs across the Drizzle schema.
- **Evidence:** `scripts/doctor.ts:38` — comment says expected schema is intentionally narrow; `scripts/doctor.ts:40` — `EXPECTED_COLUMNS` covers only `users`, `bells`, `kids`, and `feedback`; `scripts/doctor.ts:121` — live column checks iterate only those entries; `scripts/doctor.ts:128` — the check only fails when an expected column is missing, with no check for extra live columns or missing constraints; `lib/db/schema.ts:88` — `push_subscriptions` is part of the Drizzle schema but is not in `EXPECTED_COLUMNS`.
- **Why it matters at 5K:** The data-integrity bar requires prod migrations to match `information_schema` with no orphan columns; a partial checker can report clean while drift remains in unchecked tables or constraints.
- **Proposed fix (root cause):** Generate the doctor expectations from Drizzle metadata or maintain a complete table/column/constraint map, then fail on both missing and extra live columns plus missing unique/FK constraints, including `users_clerk_user_household_unique`.
- **Regression test:** Add `tests/db-doctor-coverage.test.ts` asserting every table exported from `lib/db/schema.ts` appears in the doctor coverage and that extra live columns/constraints would be reported.
- **Effort:** M
- **Cross-references:** Launch bar migration-journal/information_schema requirement.

## Out-of-domain observations

- Domain 1/Auth: `/api/village/invite-family/accept` still performs an unauthenticated write by changing invite status to `accepted` on GET, but it does not insert `users` rows and therefore did not show a direct `(clerkUserId, householdId)` uniqueness violation in the files I read.
- Domain 1/Auth: `/api/village/route.ts` member CRUD lacks the admin/parent gate already reported by Domain 1; Domain 2 impact is that its adult DELETE also trips the FK-safety issue above.
- Domain 4/API contract: several delete paths return plain text `error` strings rather than the central discriminated error keys; I did not re-audit error-shape uniformity here.

## What I did not check

I did not connect to the live production database, so `information_schema`, actual row values for `inner_circle`/`sitter`, and `drizzle.__drizzle_migrations` remain unverified. I did not read Drizzle snapshot JSON files or every route that writes `users.villageGroup`; the findings above are limited to seed files and direct cross-domain overlap reads. I stopped at the 25-file read cap.
