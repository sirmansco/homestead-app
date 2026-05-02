---
title: Covey — Launch Readiness Bar (5K Households)
date: 2026-05-02
status: bar-definition
scope: Apps/Homestead/homestead-app/
governs: docs/plans/launch-audit-2026-05-02/
---

> This file is the spec the 2026-05-02 launch-readiness audit grades against. Findings below the bar are blocks-launch by definition; findings inside the bar are should-fix or nice-to-have. The audit does not grade against aspirational targets — only the lines below.

## Target

**Covey at 5,000 registered households.**
Production URL: https://joincovey.co/ (alias homestead-app-six.vercel.app, prod sha tracked at `appSha=64e1b48` as of 2026-05-02).

## Saturation assumptions

| Dimension | Number | How derived |
|---|---|---|
| Registered households | 5,000 | Launch target |
| Median household members | 2–4 | One parent + one co-parent + 0–2 caregivers in the inner circle |
| Total user rows at saturation | 10,000–20,000 | Households × per-household median; per-household identity model means a multi-household caregiver counts once per household |
| Peak concurrent active users | 100–200 | Dinner-rush + post-school windows on a typical weekday evening |
| Peak bell-rings/min | ~10 | ~0.5% of active users ring within a 1-min window during peak |
| Peak shifts posted/min | ~5 | Lower-frequency than bells; weekly posting cadence per household |
| Peak push fan-out per bell | 2–10 recipients | Inner circle is small by design; sitter tier escalation widens it |
| Push subscriptions per user | 1–3 | iOS PWA + Android PWA + occasional desktop |

## Performance bar

Hot path is the lantern (Bell). Secondary hot path is shift-claim. All other endpoints inherit these as ceilings — if account/settings are slower than Bell, that is a bug.

| Endpoint | p50 | p95 | p99 | Notes |
|---|---|---|---|---|
| `POST /api/bell` | < 300ms | < 800ms | < 2s | DB insert + push fan-out (push await is in-budget; do not silently background) |
| `POST /api/bell/[id]/respond` | < 300ms | < 800ms | < 2s | Single-row update + 1 push to ringer |
| `POST /api/shifts/[id]/claim` | < 300ms | < 800ms | < 2s | Single-row update + 1 push to ringer |
| `GET /api/shifts` (any scope) | < 300ms | < 800ms | < 2s | Caregiver "all-households" scope is the long tail — must be indexed |
| `GET /api/bell/active` | < 200ms | < 500ms | < 1s | Polled by AppDataContext on every visible tab |
| Other API routes | < 300ms | < 800ms | < 2s | Inherits |

p95 < 800ms applies under expected concurrency (100–200 simultaneous users), not best-case.

## Reliability bar

| Bar | Threshold | How verified |
|---|---|---|
| Silent-failure rate | < 0.5% of async side-effects | Every push/email send must produce a structured log line on success or failure (`push_batch`, `[notify:email]`). No path may discard an error without logging. |
| 5xx rate | < 0.1% of requests | Vercel function logs over a rolling 24h window |
| Push delivery (where infra works) | logged for every attempt | Not "delivered" — that's outside our control. Every attempt must be observable in Vercel logs with success/failure status. |
| Bell silent-no-op visibility | recipient count surfaced to caller | Empty inner circle, missing push subs, missing VAPID — caller sees the why, not a 200 with nothing happening |
| Auth-shape uniformity | one helper, one return contract | Per spec non-negotiable #6; audit must confirm zero divergence in 5xx/401/403/409 keys |

## Security bar

| Bar | Threshold |
|---|---|
| Authentication | Clerk-only; no parallel session model; no anonymous write paths |
| Authorization | Every write route checks household membership; row-level access enforced server-side |
| XSS | No `dangerouslySetInnerHTML` on user-controlled input; no untrusted markdown rendered raw |
| File upload | EXIF strip + content-type validation + size cap on every blob upload |
| Env-var leak | No `console.log` of secrets; no client-bundled `process.env.*_SECRET` / `_PRIVATE_KEY` |
| Rate limiting | `/api/bell` POST, `/api/shifts` POST, and `/api/shifts/[id]/claim` rate-limited per user (per spec/TODO) |
| Clerk prod keys | Live keys in production (not `pk_test_*`/`sk_test_*`) |

## Data integrity bar

| Bar | Threshold |
|---|---|
| Schema authority | Drizzle schema is the source of truth; prod migrations match `information_schema`; no orphan columns; no orphan migrations applied without journal entry |
| FK behavior | Deletes on `users` / `households` either cascade safely or are blocked with a clear 4xx, never silently corrupt |
| Soft-delete consistency | Anonymized rows (`[deleted]` placeholder per current account-deletion path) match spec non-negotiable #16b |
| Per-household identity invariant | `(clerkUserId, householdId)` unique; spec non-negotiable #3; verified by query |

## Operational readiness bar

In-scope for the audit (must be observable from code/config):

- Every async side-effect emits a log line (Hard Rule #3).
- `/api/diagnostics` is informative for ops (VAPID keys, Resend, DB rowcounts, lantern recipient verdict).
- Sentry captures unhandled errors with source maps (Sentry SDK v10).
- Migration journal is in sync with `information_schema` (no out-of-band schema drift).
- Build is reproducible (no Turbopack APFS-cache surprises in CI).

Out-of-scope (gate-tracked elsewhere on `Apps/Homestead/TODO.md`, do not duplicate as audit findings):

- Insurance.
- ToS / Privacy Policy.
- COVEY trademark clearance.
- Clerk dev → prod key migration (mentioned as a finding only if code paths assume dev-key behavior).
- `joincovey.co` DNS / custom domain wiring.
- Resend domain verification for `joincovey.co`.

These are real launch gates — but they are tracked, owned, and not what an audit of shipped code surfaces. Audit may flag them once for completeness, not enumerate them.

## What is in scope for this audit

- Code already shipped to production at `appSha=64e1b48` (and any unmerged work on `main` since).
- Configuration in the repo (Vercel config, `next.config.ts`, Drizzle schema, env-var consumers, manifest, service worker).
- Operational characteristics observable through code (logs emitted, error shapes, auth contracts, rate limits, query patterns).
- Spec compliance against `Apps/Homestead/docs/specs/homestead.md` v1.0-draft.

## What is out of scope

- New features. Calendar two-way sync, billing/subscription, native wrapper, photo attachments on shifts, in-app messaging, shift bidding, child accounts, marketplace — per spec §"Out of scope for v1.0" (lines 129–145).
- Adoption-window operational gates (insurance, ToS, trademark, DNS) tracked in TODO.md.
- Performance regressions visible only under synthetic load that the audit cannot run (will be flagged as "needs load test in pre-launch staging" not "blocks-launch").
- The spec itself. The audit grades code against the spec; it does not amend the spec.

## Launch horizon

Weeks-to-months, not days. The bar above is a target list, not a prediction. The audit reports findings honestly. The user decides timeline.

## Hard rules carried into the audit

From `Machine/Protos/Protos-v9.7.md`:

- **Rule #3** — no fire-and-forget async errors. Every send catches and logs.
- **Rule #5** — no symptom patches. Every finding's fix targets root cause; band-aid-only fixes get downgraded.
- **Rule #6** — every fix carries a regression test. Fix-batch plan files must list the regression tests required.
- **Rule #11** — no fabricated actions. Every claimed verification has a tool call in the same turn.

These rules govern the audit, not just the fix work that follows it.

## Done criteria for the audit (not for launch)

- All audit artifacts committed on `audit/2026-05-02-launch-readiness`.
- Each finding falsifiable, evidence-backed, severity-tagged.
- Synthesis dedupes cross-domain repeats and surfaces graveyard repeats explicitly.
- Fix-batch plan files exist; one per batch; sequenced.
- No fix work started.
