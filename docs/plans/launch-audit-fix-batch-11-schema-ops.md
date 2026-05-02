---
title: Launch fix batch 11 — Schema authority + ops hygiene
date: 2026-05-02
status: pending
governs: L11, L12, L28, L30
parent-audit: docs/plans/launch-audit-2026-05-02/synthesis.md
batch-id: B11
prereqs: none (independent)
unblocks: none
---

## Spec

Four small fixes that close the schema-authority + ops-readiness gaps the audit surfaced. Each is independently shippable; bundled here because none warrants its own batch.

1. **L11** — Quarantine `scripts/migrate-*.ts`. Delete `scripts/migrate-kids.ts`, `scripts/migrate-shifts.ts`, `scripts/migrate-users-unique.ts`. Any still-needed schema operation is moved to a checked-in Drizzle migration. Production migration entrypoint runs only `drizzle-kit` (or the journaled flow) plus `db:doctor`.

2. **L12** — `scripts/doctor.ts:38-128` is rewritten to generate expected schema from Drizzle metadata (or maintain a complete table/column/constraint map). Fails on (a) missing expected columns, (b) extra live columns, (c) missing unique/FK constraints. Includes `users_clerk_user_household_unique`, `push_subscriptions(user_id, endpoint)` post-B7, and the B8 indexes.

3. **L28** — `.env.example` documents Sentry vars: `SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`. `sentry.server.config.ts` adds a startup `console.warn` if DSN unset.

4. **L30** — `package.json` declares `"engines": { "node": "22.x", "npm": "10.x" }` (or whichever runtime Vercel currently provisions for the project's targeted Next.js 16 — verify before committing). `vercel.json` `buildCommand` becomes `"next build"`. Migrations move out of the build command into a release-phase script that runs only after build success and before traffic shift. Synthesis-recommended mechanism: a separate Vercel deploy hook or a GitHub Actions step prior to the deploy promotion. The exact mechanism is operational; the principle is "never mutate prod schema before code that depends on it has been proven buildable."

**Done criteria:** Each L# above lands. `db:doctor` covers every table in `lib/db/schema.ts`. `.env.example` includes Sentry section. `vercel.json` `buildCommand` does not invoke `db:migrate`. `package.json` has `engines`.

**Out of scope:** Removing legacy `inner_circle`/`sitter` enum labels (tracked in B4 follow-up). Replacing the migration mechanism wholesale (e.g., switching to a release-phase service) — pick the minimal change that resolves the inverted partial-deploy risk.

## Conventions

Pattern scan:
- Drizzle migrations in `drizzle/` are the source of truth (per spec line 176 referenced by Domain 2).
- `scripts/doctor.ts` is the existing drift checker; expected-columns map is hard-coded today.
- `package.json` does not currently have an `engines` block (verified by Domain 7).

## File map

- `scripts/migrate-kids.ts` — DELETE.
- `scripts/migrate-shifts.ts` — DELETE.
- `scripts/migrate-users-unique.ts` — DELETE.
- `scripts/doctor.ts:38-128` — rewrite.
- `.env.example` — append Sentry section.
- `sentry.server.config.ts` — startup warn if DSN unset.
- `package.json` — add `engines`.
- `vercel.json` — change `buildCommand`; ensure the release-phase migration mechanism is documented.
- `tests/schema-migration-entrypoints.test.ts` — assert no `scripts/migrate-*.ts` files contain schema DDL outside `drizzle/` (regression for L11; should pass trivially after the deletions).
- `tests/db-doctor-coverage.test.ts` — regression for L12.
- `tests/sentry-env-documented.test.ts` — regression for L28.
- `tests/build-ordering-config.test.ts` — regression for L30.

## Graveyard

(empty)

## Anchors

- `drizzle/_journal.json` — preserve. It is the migration history; do not edit by hand.
- `lib/db/schema.ts` — preserve schema definitions; this batch only changes tooling around them.

## Fragile areas

- L30 release-phase migration mechanism is the single most-fragile change in this batch. A botched mechanism can leave production deploys without migrations applied at all (the inverse problem). Pick a mechanism that fails loudly if migrations error, and keep a manual `db:migrate` command in `package.json` as a break-glass.
- `scripts/doctor.ts` rewrite — the introspect-from-Drizzle path requires reading Drizzle's internal metadata API; verify against `node_modules/drizzle-orm/dist/` before relying on it.
- `engines` pin must match what Vercel actually provisions; over-tight pins block deploys. Loosen to `>=22.x <23` or similar if needed.

## Regression tests required (Hard Rule #6)

Listed in the file map.
