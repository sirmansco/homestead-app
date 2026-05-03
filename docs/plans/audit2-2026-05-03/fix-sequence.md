---
title: Audit-2 fix-batch sequencing
date: 2026-05-03
parent-audit: docs/plans/audit2-2026-05-03/findings.md
phase: 4
batches: 4
total-pr-units: 4
---

## Context

Second-pass code review (2026-05-03) confirmed all 30 prior-audit (L1–L30) findings are closed in the
current codebase. This sequence covers the 11 new findings surfaced by that review, grouped into 4
fix batches.

## Findings register

| ID | One-line | Severity | Batch |
|---|---|---|---|
| F-P2-H | Last-admin guard missing on `/api/circle/leave` | Critical | A1 |
| F-P1-E | Shift cancel UPDATE non-atomic (no status predicate) | Critical | A1 |
| F-P2-I | `DELETE /api/household/members/[id]` — same last-admin gap as F-P2-H | Critical | A1 |
| F-P1-F | Family invite POST accept ignores `parentEmail` match; `acceptedHouseholdId` never written | High | A2 |
| F-P1-G | Family invite tokens never expire | High | A2 |
| F-P2-A | Invite-family POST resolves `fromUserId` as `users[0]` (wrong in multi-household) | Medium | A2 |
| F-P2-J | `sentry.client.config.ts` uses `NEXT_PUBLIC_SENTRY_DSN`; mismatched var silently drops all client errors | High | A3 |
| T-A | Bell escalation emits no structured log on success | High | A3 |
| T-D | Household PATCH does not log setup completion | High | A3 |
| F-P3-G | Account deletion does not call `notifyShiftCancelled` for shifts cancelled on behalf of departing user | Medium | A3 |
| F-P1-B | Bell poll does not pause on `visibilitychange` | Low | A4 |

## Sequence

| # | Batch | Plan file | Findings | Prereqs | Effort |
|---|---|---|---|---|---|
| A1 | Last-admin guard + atomic cancel | `fix-batch-A1-last-admin-atomic-cancel.md` | F-P2-H, F-P1-E, F-P2-I | none | S |
| A2 | Invite correctness + expiry | `fix-batch-A2-invite-correctness.md` | F-P1-F, F-P1-G, F-P2-A | none | M (migration) |
| A3 | Observability + account-deletion notify | `fix-batch-A3-observability.md` | F-P2-J, T-A, T-D, F-P3-G | none | S |
| A4 | Bell poll visibility pause | `fix-batch-A4-bell-poll-visibility.md` | F-P1-B | none | S |

## Dependency graph

All four batches are independent. No mandatory serialization between them.

A1 and A3 touch no shared files; run in parallel if two worktrees are available.
A2 requires a Drizzle migration — run its production migration window independently of the others.
A4 is purely client-side; can be batched with A3 if desired.

## Suggested single-stream order

1. **A1** — two one-liners + a guard; smallest blast radius, highest severity
2. **A3** — logging and Sentry config; zero DB changes
3. **A2** — requires migration; coordinate production migration window
4. **A4** — polish; defer until after the above are in production

## Hard-rule compliance

Each batch plan includes a `## Regression tests required` section. No batch ships without its named test.
Every file:line reference in the batch plans traces back to a Read in the 2026-05-03 review session.
