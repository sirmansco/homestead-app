---
title: Hard Rule #9 graveyard scan — 2026-05-02
date: 2026-05-02
governs: Apps/Homestead/homestead-app/docs/plans/
rule: Protos v9.7 Hard Rule #9 — items unchanged 3+ calendar days in graveyard force commit-or-kill
---

## Scope

Plans in `docs/plans/` with non-terminal status. Audit snapshots (`launch-readiness-5k.md`, `launch-audit-2026-05-02/*`, `homestead-audit.md`, `v1-spec-gap-audit.md`) are inputs to this audit, not graveyard targets. Plans marked `status: complete` (`tab-switch-performance.md`, `ui-polish-diagnostics.md`, `ui-shifts-tabbar-whenfix.md`, `dark-mode-sweep.md`, `enum-migration.md`, `phase6-cutover-cleanup.md`, `visual-rebrand.md`, `debug-2026-05-01.md`, `rebrand-rollback.md`) are out of scope.

## Method

For each non-complete plan, check (a) whether it has a `## Graveyard` section and (b) whether any entry is dated ≥ 2026-04-29 (3+ calendar days before today, 2026-05-02). Hard Rule #9 measures calendar days *in the graveyard*, not total age of the plan.

## Active plan files inspected

| Plan | Status | Last-updated | Graveyard? | 3+ day carries |
|---|---|---|---|---|
| `clerk-prod-migration.md` | draft | 2026-04-28 | none | n/a |
| `phase5-push-verification.md` | in-progress | 2026-05-01 | empty | none |
| `fix-failing-tests.md` | in-progress | 2026-05-01 | none | n/a |
| `vercel-toolbar.md` | in-progress | 2026-05-01 | none | n/a |
| `homestead-covey-migration.md` | phase-5-pending | 2026-05-01 | none | n/a |

## Findings

**No Hard Rule #9 violations.**

No active plan has a graveyard entry that has carried for 3+ calendar days unchanged. The two existing audit-input docs (`homestead-audit.md` 2026-04-23 and `v1-spec-gap-audit.md` 2026-04-26) are audit snapshots, not active plan files with graveyards — Batch 1 of `v1-spec-gap-audit.md` already shipped per its own Handoff section.

## Adjacent observations (not Hard Rule #9 hits, surfaced for context)

The following are plan-file *staleness* signals — distinct from graveyard carries but worth flagging for the user since some intersect with the audit:

- **`clerk-prod-migration.md`** (draft, 4 days since last edit). Pre-launch operational gate per `TODO.md`. Out-of-scope per the audit bar but relevant for launch sequencing.
- **`fix-failing-tests.md`** (in-progress, 1 day). Tests reference deleted `ScreenVillage.tsx`. Likely subsumed by the audit's "data integrity / dead-code" sweep — flag for synthesis to dedupe.
- **`vercel-toolbar.md`** (in-progress, 1 day). Tooling, not launch-blocking. Out of audit scope.
- **`phase5-push-verification.md`** (in-progress, 1 day). Push verification on real device — operational, not code. Audit may surface push-pipeline findings adjacent to this plan.
- **`homestead-covey-migration.md`** (phase-5-pending, 1 day). Code complete behind `COVEY_BRAND_ACTIVE` flag, blocked on TM clearance. Out of audit scope (operational).

## Action

None required by Hard Rule #9. Audit proceeds without commit-or-kill interrupts.
