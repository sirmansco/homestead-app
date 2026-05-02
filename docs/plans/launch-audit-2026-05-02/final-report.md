---
title: Launch audit — final report
date: 2026-05-02
branch: audit/2026-05-02-launch-readiness
parent-bar: docs/plans/launch-readiness-5k.md
phase: 5
status: audit-complete-no-fixes-started
---

## Summary

Seven domains audited via fresh-context Codex passes (Phase 2). 38 raw findings consolidated into 30 unique launch-relevant items (Phase 3 synthesis). 11 fix batches authored as Protos v9.7 Phase 3 plans (Phase 4). No fix work started.

The headline pattern is consistent across domains: Covey's first-principles design is sound (Clerk org as household, per-household identity, structured push outcomes available, idempotent escalation logic, anonymization tombstone for self-deletion), but **launch-readiness gaps cluster around five recurring shapes** — admin authority divergence, anonymous/under-gated write paths, silent async side-effects, missing DB indexes on hot paths, and an incomplete enum migration that produces silent notification misses. None of the gaps require a redesign; all 30 items are addressable inside the 11 fix batches.

## Counts by severity

| Severity | Count | % of total |
|---|---|---|
| **blocks-launch** | 16 | 53% |
| **should-fix** | 14 | 47% |
| nice-to-have | 0 | — |
| out-of-scope | 0 | — |
| **Total unique** | **30** | 100% |

Pre-dedupe per-domain raw counts: D1 = 7, D2 = 4, D3 = 5, D4 = 7, D5 = 3, D6 = 5, D7 = 7. Total raw = 38. Eight cross-domain merges produced the 30-item synthesis. Three severity reconciliations tipped findings from should-fix to blocks-launch (L4, L18, L26 — see `synthesis.md` "Severity reconciliations").

## Recommended sequence

11 fix batches, 11 PR-units total. Full plan files at `docs/plans/launch-audit-fix-batch-NN-<slug>.md`. Master sequence at `docs/plans/launch-audit-2026-05-02/fix-sequence.md`.

The mandatory serializations are:

1. **Auth chain** — B1 (admin helper) → B2 (authz + invite-flow) → B3 (soft-delete/FK).
2. **Enum/lantern/cron chain** — B4 (enum migration) → B5 (lantern observability) → B6 (cron wiring).

Five batches (B7 push subs, B8 DB indexes, B9 validation contract, B10 upload security, B11 schema/ops hygiene) are independent and can run in parallel worktrees.

**Single-engineer linear order:** B1 → B2 → B4 → B5 → B6 → B3 → B7 → B8 → B9 → B10 → B11.

**Two-stream parallel order:**
- Stream A: B1 → B2 → B3 → B7 → B10.
- Stream B: B4 → B5 → B6 → B8 → B9 → B11.

## Total PR-units

**11 PR-units.** Effort mix: 1 L (B10 upload security, privacy-critical with two coupled changes) + 10 M.

Rough wall-clock estimates (excluding production-migration windows, staging verification, and any UI sweep B10 may require):

- Single engineer, focused: ~20–35 working days.
- Two parallel streams: ~11–18 working days across both streams.

These are upper-bound estimates; several batches (B6, B8, B11) are largely config + migration and may close faster than M-effort suggests.

## Headline findings (the 16 blocks-launch items, condensed)

| L# | One-line | Batch |
|---|---|---|
| L1 | Anonymous GET mutates `familyInvites.status = 'accepted'` | B2 |
| L2 | Village CRUD has no admin gate; delete raw-DELETEs `users` rows tripping FK restrict | B2 (authz), B3 (FK) |
| L3 | Village invite (Clerk org invite) has no admin gate; accepts caller-supplied `app_role` metadata | B2 |
| L4 | Three different admin authority models (`role==='parent'` vs. `users.isAdmin`) | B1 |
| L9 | Member/village hard-delete on `users` 5xxs via FK restrict; tombstone path exists in `account/route.ts` but isn't reused | B3 |
| L10 | Legacy `inner_circle`/`sitter` rows still insertable; notification queries only match `covey`/`field` → silent miss | B4 |
| L13 | Lantern returns `sent: innerCircle.length` ignoring `pushToUsers()` `PushResult`; UI claims push enabled when subscribe failed | B5 |
| L14 | `vercel.json` has no `crons` entry; `/api/bell/cron` never fires in production | B6 |
| L18 | `push_subscriptions` lacks `(user_id, endpoint)` uniqueness; concurrent registrations multiply fan-out cost | B7 |
| L20 | `/api/bell/active` polled every 10s per tab; `bells`/`bell_responses` have no secondary indexes | B8 |
| L21 | `GET /api/shifts` filters on six unindexed columns; caregiver "all-households" scope is the long tail | B8 |
| L23 | `POST /api/bell` accepts invalid and inverted time ranges (no ISO validation, no `start < end`) | B9 |
| L24 | `[id]` routes pass path params straight to Drizzle `eq(...)` without UUID validation → DB cast 5xxs | B9 |
| L26 | `/api/feedback` POST has no `Content-Length` cap and no rate limit | B9 |
| L27 | `/api/upload` validates by extension only (non-JPEG bypasses EXIF strip); blob keys deterministic + public | B10 |

Plus 14 should-fix items (full list in `synthesis.md`). Severity reconciliations in `synthesis.md` document the three findings that crossed the should-fix → blocks-launch line.

## What this audit did not check

Carried forward from the seven domain reports:

- Production `information_schema` and `drizzle.__drizzle_migrations` parity (sandbox cannot connect to prod DB).
- Live VAPID, Sentry, and Resend env values in production (configuration, not code).
- Browser-automated PWA install verification (Lighthouse, real-device install path).
- Load-test confirmation of p95 estimates at 100–200 concurrent users.
- Exhaustive XSS sweep — Domain 7 sampled `dangerouslySetInnerHTML` and found none in scanned components, but the sweep was not exhaustive.
- Out-of-scope operational gates per `launch-readiness-5k.md`: Insurance, ToS / Privacy Policy, COVEY trademark clearance, Clerk dev → prod key migration, joincovey.co DNS / custom domain, Resend domain verification. Tracked on `Apps/Homestead/TODO.md`.

These belong to a pre-launch staging pass after the fix batches land, not to this audit.

## Open questions — user direction received 2026-05-02

1. **L5 — Notification preferences scope (B2).** *User: not sure.* **Resolution:** B2 defers L5 to a follow-up plan. The remaining L1/L2/L3/L6/L7 fixes in B2 do not depend on L5. B2 ships without changing `app/api/notifications/route.ts:80`; an L5-only follow-up plan opens once direction is decided.

2. **L6 — Shift claim caregiver-role gate (B2).** *User: caregivers only.* **Resolution:** B2's L6 fix gates `POST /api/shifts/[id]/claim` on `caller.role === 'caregiver'` unconditionally. Parents posting shifts in their own household cannot claim them. Regression test asserts parent attempts return 403.

3. **L27 — Upload access mode (B10).** *User decision 2026-05-02: option (a).* **Resolution:** B10 implements private blob + authenticated `/api/photo/[id]` proxy with `requireHousehold()` ownership gate and `Cache-Control: private, max-age=3600`. Rationale: child photos are unrevocable bearer tokens under option (b); the UI sweep cost for (a) is hours, and (a) ages better against future requirements (audit logs, time-limited share links, household-leaving revocation). Option (b) rejected.

**Net effect on the 11-batch plan:**
- B2 ships without L5 (drop 1 should-fix from B2's scope; total batch count unchanged).
- B2's L6 fix-shape is firm: caregivers only.
- B10 unpaused. All 11 batches now ready to schedule.

Adjusted total at-launch coverage if all 11 batches ship: 29 of 30 findings closed. The one unresolved is L5 (should-fix). Launch is no longer blocked on a pending decision — every blocks-launch finding has a ready plan.
