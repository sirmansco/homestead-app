# Covey Full Functionality + Code Review

You are auditing **Covey** (formerly Homestead), a live Next.js 16 / React 19 PWA for family childcare coordination (tagline: "Build your covey"). Deployed at joincovey.co via Vercel. Auth via Clerk (org-as-household model). DB: Neon Postgres + Drizzle ORM. Push: Web Push API (VAPID). Crash/error monitoring: Sentry. Email: Resend. Blob storage: Vercel Blob. Subscription/billing: none yet (pre-monetization). Maintained under the `sirmansco/covey-app` GitHub repo.

Core architecture: Next.js App Router (all routes in `app/`). Single-page PWA shell in `app/components/CoveyApp.tsx`. Five screens: Perch (keeper schedule view) / Whistles (watcher unified shift view) / Lantern (urgent signal / bell flow) / Circle (household members + kids) / Settings. Shared data layer in `app/context/AppDataContext.tsx` (bell polling + SSE shift stream + village fetch). Role model: `keeper` (parent) vs `watcher` (caregiver). Village groups: `covey` (inner circle) and `field` (outer tier). Household identity is a Clerk org; one `users` row per (clerkUserId, householdId) pair.

The app is **in production**. Every recommendation must be tight, scoped, and shippable as a PR against the `main` branch. No speculative refactors. No "while we're in there" scope creep.

## Context on prior audit work

A structured launch audit ran 2026-05-02 across seven domains (auth-access, data-integrity, notifications-observability, api-contract, pwa-sw-push, performance, security-ops). It produced 30 unique findings across 11 fix batches. Full results at `docs/plans/launch-audit-2026-05-02/`. The most relevant prior output:

- `final-report.md` — 16 blocks-launch + 14 should-fix items, batch sequence, open questions resolved
- `synthesis.md` — deduplicated finding register with root causes (L1–L30)
- `fix-sequence.md` — recommended PR ordering

**Do not re-derive findings the prior audit already documented unless you find new evidence that changes severity or root cause.** Reference the prior `L#` IDs when your findings overlap. Surface only findings that are genuinely new, or where the prior audit assessed incorrect severity given code you've now read more carefully.

## Your role

Act as a senior staff engineer doing a structured review. Be direct. No fluff, no AI-signaling phrases, no em dashes, no hyphens in prose. Hold positions under pressure unless given new evidence. Surface real problems, not theoretical ones.

## Deliverables (in this exact order, do not skip ahead)

### 1. Repo orientation (read-only)

- Map the project structure: screens/routes, state management, persistence layer, push delivery module, SSE stream, cron, telemetry hooks
- List actual tech stack found (versions from `package.json`, not assumptions)
- Identify what is wired for crash reporting and structured logging, and what is missing
- Output: one-screen summary, no code yet

### 2. Screen + flow inventory

Build a table covering every screen and every critical flow. Columns:

- Screen / route
- States handled (empty, loading, error, populated, offline)
- States missing or unhandled
- Entry points
- Exit points
- Persistence behavior (localStorage, poll, SSE, none)
- Telemetry coverage (yes / partial / none)

Critical flows to inventory at minimum: onboarding / setup, keeper posting a shift, watcher claiming a shift, keeper lighting the Lantern, watcher responding to the Lantern, escalation cron, push subscription registration, push notification delivery, invite-family flow, circle member management, household admin transfer, account deletion, sign out.

### 3. Four-pass code review

Run these passes in order. For each finding produce: file path, line range, severity (P0/P1/P2/P3), risk, recommended fix, estimated diff size (S/M/L).

**Pass 1: User flow correctness**
Trace each critical flow through the code. Flag anything that breaks on cold start, mid-session, after backgrounding, airplane mode, or flaky network. Pay special attention to:

- Push registration racing SW activation on iOS PWA first install
- Bell polling interval surviving tab-backgrounding and focus/blur cycles
- SSE reconnect behavior after Vercel's 30s hard kill
- Household switcher reload loop (setActive + window.location.reload pattern)
- Setup redirect loop (household route returns `!setupCompleteAt` -> redirect to /setup -> /setup fetches /api/household again)
- Deep-link tab param consumed on first mount but not on second mount if app was already open

**Pass 2: Risk-weighted code audit**
Review in this priority order:

1. Auth and authorization (Clerk session, requireHousehold, requireUser, admin gates, cross-household access)
2. Push delivery pipeline (VAPID init, subscription upsert, stale-sub pruning, Apple JWT vs. FCM 403 handling, sendBatch error classification)
3. Bell / Lantern flows (atomic claim, concurrent response + escalation race, cron idempotency, `escalatedAt IS NULL` guard)
4. Shift operations (claim atomicity, preferredCaregiverId gate, unclaim race, recurring shift expansion, rate limits)
5. Data persistence and migrations (Drizzle journal drift risk, enum migration safety, FK constraint failure surfaces)
6. Notification preference gating (per-user opt-out columns, multi-household preference scoping)
7. Household and account lifecycle (tombstone path, Clerk delete ordering, familyInvite token expiry)
8. Rate limiting (in-memory, per-instance, not Redis — which routes are exposed if multiple instances spin up)
9. Error boundaries and Sentry coverage
10. Dead code, duplicated logic, unused dependencies

**Pass 3: Edge cases**
Empty states (new household with zero shifts, zero circle members, zero lantern history), 500+ shifts performance, multi-household watcher switching between households mid-session, bell fired and app backgrounded before response (polling resumes on focus?), concurrent claim race (two watchers tap claim simultaneously), keeper tries to claim their own shift, account deletion with active claimed shifts, invite token replay (token used twice), household with only one admin tries to leave, caregiver with no push subscription receives bell (silent miss?), dark mode parity, viewport resize from mobile to desktop breakpoint mid-session, service worker update mid-session causing stale cache, `localStorage.getItem('hs.screen')` returning a legacy tab ID after the rename.

**Pass 4: Telemetry gap analysis**
For every P0/P1 finding above, answer: could I confirm this fix worked in production with current instrumentation? If no, that gap is itself a finding.

Specifically check:
- Is there a structured log line for every push delivery outcome? (bell ring, bell escalate, shift claimed, shift released, shift cancelled)
- Is the `push_batch` event logged with enough fields to differentiate VAPID misconfiguration from network failure?
- Does the Sentry DSN guard in `sentry.server.config.ts` mean errors are silently dropped in production if `SENTRY_DSN` is not set?
- Is there a log line or metric for setup-completion rate, so you'd know if new users are getting stuck in the setup redirect loop?
- Are bell cron batches logged with enough context to detect runaway backlog (batch always full at 50)?

### 4. Triage matrix

Bucket every finding (new and any prior-audit findings with changed severity) into:

- **Critical** (data loss, auth bypass, silent push failure, crash): same-day patch, feature-flagged if risky
- **High** (broken user flow, wrong state, notification miss): next PR
- **Medium** (friction, inconsistency, logging gap): batched into next planned release
- **Low** (polish, cosmetic): backlog

### 5. Shippability rules I expect you to honor

- One concern per PR, small diffs, easy rollback
- Anything that touches push delivery, the cron, or the DB schema goes behind a verified staging pass first
- If a fix touches Drizzle migrations, propose the rollback path and the production migration window explicitly
- Do not propose framework migrations, React server component rewrites, or state library swaps in this pass
- Do not propose changes to the role model, household model, or village group taxonomy

## Covey-specific context the auditor must hold

- `households` maps 1:1 to Clerk orgs via `clerk_org_id`. The active household is Clerk's `orgId` on the session.
- One `users` row per `(clerkUserId, householdId)`. A user who is a caregiver for two families has two rows.
- Role column: `keeper` (was `parent`) and `watcher` (was `caregiver`). DB migration (`drizzle/0012_role_rename_keeper_watcher.sql`) is written but **has not run in production** (as of 2026-05-03). PR #82 is open and waiting on Neon SQL editor migration before merge.
- Village groups: `covey` (inner circle, bell-tier-1) and `field` (outer tier, bell-tier-2/escalation). Legacy enum values `inner_circle` and `sitter` may still exist in production rows (B4 enum migration not yet applied). `notify.ts` uses `inArray(['covey', 'inner_circle'])` as a read-compat shim.
- Bell = Lantern. The API and DB use `bell`/`bells`; the UI uses "Lantern". All schema and route files use the `bell` identifier.
- Push subscriptions are stored in `push_subscriptions` with a `(userId, endpoint)` unique constraint. The upsert in `push/subscribe/route.ts` uses `onConflictDoUpdate` on that pair.
- SSE stream at `/api/whistles/stream` is used by ScreenWhistles for live village-scope shift updates. Vercel kills SSE connections after ~30s; the client reconnects on the `error` event with a 5s backoff, and immediately on the `reconnect` event.
- Rate limiter is in-memory (`lib/ratelimit.ts`). It resets on cold start and does not coordinate across Vercel function instances.
- Sentry is configured in all three config files (`sentry.server.config.ts`, `sentry.client.config.ts`, `sentry.edge.config.ts`). `enabled: process.env.NODE_ENV === 'production'` — dev errors are not sent.
- The `bell-escalation.ts` escalation guard is `AND escalated_at IS NULL` on the UPDATE, not a SELECT lock. This means concurrent escalations race to update; the loser gets 0 rows returned and returns early. This is correct.
- `CRON_SECRET` is set in Vercel (Production + Preview). The cron route at `/api/lantern/cron` is authenticated with `Authorization: Bearer <CRON_SECRET>`. The `vercel.json` cron entry wires this.
- localStorage keys: `hs.role` (dev role override), `hs.screen` (last active tab), `hs.sw.lastUpdate` (SW update throttle), `covey-theme` / `homestead-theme` (dual-read theme migration guard).
- The `COVEY_BRAND_ACTIVE` env var gates Covey-branded copy vs. Homestead copy. It is `true` in production now.
- `DEV_EMAILS` (comma-separated in `NEXT_PUBLIC_DEV_EMAILS`) enables the role-switcher UI for allowlisted accounts. This is client-side only and does not change server-side role enforcement.

## Working agreement

- Read before writing. Do not modify code in passes 1 through 4. Review only.
- If you need to look at a file, view it. Do not guess at contents.
- If something is ambiguous (intended behavior vs. bug), ask before flagging it as a bug.
- After the four passes, stop and wait for the user to pick what to fix first. Do not start patching unprompted.
- When greenlit for a fix, produce the smallest possible diff, the test that proves it, and the rollback plan.
- Reference prior audit `L#` IDs when your findings overlap rather than restating root causes already documented.

Begin with deliverable 1.
