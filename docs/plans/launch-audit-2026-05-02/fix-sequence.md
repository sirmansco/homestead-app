---
title: Launch audit — fix-batch sequencing
date: 2026-05-02
parent-audit: docs/plans/launch-audit-2026-05-02/synthesis.md
phase: 4
batches: 11
total-pr-units: 11
---

## Method

Phase 4 splits the 30 consolidated findings (`synthesis.md` L1–L30) into 11 fix batches. One Protos Phase 3 plan file per batch lives at `docs/plans/launch-audit-fix-batch-NN-<slug>.md`. Each batch has a self-contained plan (Spec / Conventions / File map / Graveyard / Anchors / Fragile areas / Regression tests) so it can be executed by a fresh session per Protos v9.7.

Sequencing optimizes for: (1) prerequisite ordering (B1 unblocks B2; B2 unblocks B3); (2) blocks-launch density up front; (3) avoiding merge-conflict-prone shared file surfaces by spreading routes across batches; (4) parallel-friendly batches near the end (B7, B8, B10, B11 are independent and can run in parallel worktrees).

## Sequence

| # | Batch | Plan file | L# covered | Severity mix | Prereq | Effort |
|---|---|---|---|---|---|---|
| 1 | Admin authority foundation | `launch-audit-fix-batch-01-admin-authority.md` | L4 | 1 BL | none | M |
| 2 | Authz, invite-flow, multi-household | `launch-audit-fix-batch-02-authz-invite.md` | L1, L2 (authz half), L3, L6, L7 (L5 DEFERRED) | 3 BL + 2 SF | B1 | M |
| 3 | User soft-delete / FK safety | `launch-audit-fix-batch-03-soft-delete-fk.md` | L9, L2 (FK half) | 1 BL | B2 | M |
| 4 | Village-group enum migration | `launch-audit-fix-batch-04-village-group-enum.md` | L10 | 1 BL | none | M |
| 5 | Lantern silent-success + observability | `launch-audit-fix-batch-05-lantern-observability.md` | L13, L16, L29 | 1 BL + 2 SF | B4 | M |
| 6 | Cron wiring + escalation | `launch-audit-fix-batch-06-cron-escalation.md` | L14, L15 | 1 BL + 1 SF | B4, B5 | M |
| 7 | Push subscription correctness | `launch-audit-fix-batch-07-push-subs.md` | L17, L18, L19 | 1 BL + 2 SF | none | M |
| 8 | DB indexing pass | `launch-audit-fix-batch-08-db-indexes.md` | L20, L21, L22 | 2 BL + 1 SF | none | M |
| 9 | API validation contract | `launch-audit-fix-batch-09-validation-contract.md` | L8, L23, L24, L25, L26 | 3 BL + 2 SF | none | M |
| 10 | Upload security | `launch-audit-fix-batch-10-upload-security.md` | L27 | 1 BL | none | L |
| 11 | Schema authority + ops hygiene | `launch-audit-fix-batch-11-schema-ops.md` | L11, L12, L28, L30 | 4 SF | none | M |

**Severity totals across batches:** 16 blocks-launch + 14 should-fix = 30 (matches `synthesis.md` post-dedupe count).

**Decisions received 2026-05-02:** L5 deferred (user direction pending — opens as separate plan); L6 locked to caregivers-only; L27 locked to option (a) private blob + authenticated `/api/photo/[id]` proxy with `Cache-Control: private, max-age=3600`.

## Critical-path chain

The only mandatory serialization is the auth chain:

```
B1 (admin helper)
  └─ B2 (uses helper across 6 routes)
       └─ B3 (re-routes village delete; depends on B2's auth migration to avoid conflict)
```

B4 → B5 → B6 is also serialized:

```
B4 (enum normalization + read-compat)
  └─ B5 (lantern eligible-set correctness assumes B4)
       └─ B6 (cron escalation queries assume B4; cron observability assumes B5)
```

Everything else (B7, B8, B9, B10, B11) is independent of the chains and of each other.

## Suggested merge sequence (one-PR-per-batch model)

A defensible single-stream order, executable by one engineer or one rotating session:

1. **B1** — admin helper. Smallest blast radius; unblocks B2.
2. **B2** — authz + invite-flow. Closes 3 blocks-launch + 3 should-fix.
3. **B4** — enum migration. Independent of the auth chain; parallel-friendly to B2 if two streams available.
4. **B5** — lantern observability. Depends on B4.
5. **B6** — cron + escalation. Depends on B4, B5.
6. **B3** — soft-delete / FK safety. Depends on B2.
7. **B7** — push subscriptions.
8. **B8** — DB indexing pass. Migration; coordinate with low-traffic window per B8's plan.
9. **B9** — API validation contract.
10. **B10** — upload security. Privacy-critical; the only L-effort batch.
11. **B11** — schema + ops hygiene.

## Parallel-stream alternative (worktree model per Protos v9.7)

If two engineers (or two parallel sessions in worktrees) are available:

```
Stream A:  B1 → B2 → B3 → B7 → B10
Stream B:  B4 → B5 → B6 → B8 → B9 → B11
```

Both streams converge before launch. No file-surface conflicts between streams (verified by inspection of File map sections — Stream A touches auth/account/village; Stream B touches enum/notify/cron/db/api-validation/ops).

## Total work estimate (PR-units)

- 11 PR-units total (one per batch).
- Effort per Protos S/M/L: 1 L (B10) + 10 M = roughly 20–35 working days of focused work for one engineer, or 11–18 days across two parallel streams.
- The estimate excludes (a) production migration windows, (b) staging verification time, (c) any UI sweep required by B10 option (a).

## What this sequence does NOT solve

- **Out-of-scope launch gates** (per `launch-readiness-5k.md`): Insurance, ToS / Privacy Policy, COVEY trademark clearance, Clerk dev → prod key migration, joincovey.co DNS / custom domain, Resend domain verification. These remain on `Apps/Homestead/TODO.md`.
- **Items synthesis explicitly deferred:** old enum-label removal post-B4 (a follow-up plan once doctor reports zero rows for ≥7 days); ICS time-bound + caching headers from L22's full fix-shape; account-deletion concurrency (data-integrity F1 tail observation, not promoted in synthesis).
- **Items the audit could not check:** production `information_schema` parity, live VAPID env values, browser-automated PWA install verification, load-test confirmation of p95 estimates, exhaustive XSS sweep. These belong to a pre-launch staging pass after the batches land.

## Hard-rule compliance check

Each batch's plan file includes a `## Regression tests required (Hard Rule #6)` section. No batch ships without its named regression test. The audit's `## Hard rules carried into the audit` block (`launch-readiness-5k.md` lines 116–123) is reflected: every fix targets root cause (no band-aids, Rule #5), every fix carries a regression test (Rule #6), no fabricated actions in this synthesis or these plans (Rule #11) — every file:line reference traces back to a Read in the relevant domain audit or this orchestrator's verification reads.
