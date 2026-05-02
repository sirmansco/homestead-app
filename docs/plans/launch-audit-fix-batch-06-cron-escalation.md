---
title: Launch fix batch 06 — Cron wiring and bounded escalation
date: 2026-05-02
status: pending
governs: L14, L15
parent-audit: docs/plans/launch-audit-2026-05-02/synthesis.md
batch-id: B6
prereqs: B4 (escalation queries match enum), B5 (cron path emits observable logs)
unblocks: none
---

## Spec

After this batch, automatic bell escalation fires in production every minute, processing a bounded backlog with capped concurrency.

1. **L14** — `vercel.json` declares `crons: [{ path: '/api/bell/cron', schedule: '* * * * *' }]` and `functions: { 'app/api/bell/cron/route.ts': { maxDuration: 30 } }`.
2. **L15** — `app/api/bell/cron/route.ts:14-22` selects due bells with explicit `LIMIT` (initial: 50). Adds DB index `bells(status, escalated_at, created_at)` matching the WHERE. `Promise.allSettled` is wrapped in a small concurrency cap (initial: 5) via `p-limit` or equivalent.

**Done criteria:** Cron entry exists in `vercel.json`. Index migration ships. Regression test seeds >LIMIT due bells and asserts one cron tick processes ≤LIMIT, leaves the rest, and starts ≤cap concurrent escalations.

**Out of scope:** Replacing `Promise.allSettled` with a single `UPDATE ... RETURNING` batch (a stronger fix, but riskier for this audit's pre-launch window). Note in the plan as a follow-up if rates exceed LIMIT routinely.

## Conventions

Pattern scan:
- Cron route already idempotent at `lib/bell-escalation.ts:15-20` (`AND escalated_at IS NULL`); preserve.
- Bearer-token auth at `app/api/bell/cron/route.ts:8-10` uses `CRON_SECRET`. Vercel's cron sender supplies the secret per Vercel docs — verify the platform's cron auth header matches before merge.
- Drizzle indexes are declared via the table-level callback in `lib/db/schema.ts`; see existing index patterns in the same file.
- `p-limit` is not currently a dependency — verify before introducing; alternative is a manual semaphore.

## File map

- `vercel.json` — add `crons` and `functions` blocks.
- `lib/db/schema.ts` (bells table) — add index `(status, escalated_at, created_at)`.
- `drizzle/00XX_bells_escalation_index.sql` — Drizzle-generated migration.
- `app/api/bell/cron/route.ts:14-22` — add `LIMIT 50` to the select; wrap escalations in concurrency cap (5).
- `package.json` — add `p-limit` if used.
- `tests/vercel-cron-config.test.ts` — assert `vercel.json` declares the cron entry.
- `tests/bell-cron-batching.test.ts` — assert: seed 200 due bells, run cron, assert ≤50 escalated; subsequent ticks drain the rest; concurrency does not exceed cap.

## Graveyard

(empty)

## Anchors

- `lib/bell-escalation.ts` `escalated_at IS NULL` idempotency — do not regress.
- `CRON_SECRET` Bearer auth — do not weaken.
- The Vercel cron schedule `* * * * *` is the spec contract (5-min escalation latency budget = 1-min poll + up-to-4-min staleness in worst case).

## Fragile areas

- Vercel cron secret/header contract — confirm against current Vercel docs before merge. If Vercel's `CRON_SECRET` env auto-injection has changed in Next.js 16 era, adjust the auth check accordingly. Read `node_modules/next/dist/docs/` if uncertain (per `homestead-app/AGENTS.md`).
- `LIMIT 50` is a guess — calibrate against actual production bell rates before relaxing or tightening.
- New index drops `bells` write throughput slightly; expected acceptable at 5K but monitor.

## Regression tests required (Hard Rule #6)

- `tests/vercel-cron-config.test.ts` — config presence test.
- `tests/bell-cron-batching.test.ts` — behavior test for L15.
- `tests/bell-cron-idempotency.test.ts` (existing or new) — re-confirm two ticks against the same due bell escalate exactly once. Cite as the existing anchor if a test already covers this.
