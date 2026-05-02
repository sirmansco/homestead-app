---
title: Audit domains and seed files — 2026-05-02
date: 2026-05-02
governs: Phase 2 Codex invocations
---

> Seven domains. Each gets one Codex invocation. Order matters for the running synthesis (each domain sees prior domains' summaries). Seed files are starting points, not exhaustive — Codex grep-walks within the 25-Read cap.

## Domain 1 — Auth & access

**Charter.** Verify the auth & access bar: Clerk-only authentication, every write checks household membership, role gates work, multi-household resolution is correct, the per-household identity invariant holds (`(clerkUserId, householdId)` unique), discriminated 401/403/409 keys are uniform across routes, no anonymous write paths. Particular attention to `requireHousehold()` — `homestead-audit.md` flagged this as the highest-blast-radius file (12 routes, mixed read/write).

**Seed files.**
- `lib/auth/household.ts`
- `lib/api-error.ts`
- `app/api/account/route.ts`
- `app/api/bell/route.ts`
- `app/api/bell/[id]/route.ts`
- `app/api/bell/[id]/respond/route.ts`
- `app/api/shifts/route.ts`
- `app/api/shifts/[id]/claim/route.ts`
- `app/api/shifts/[id]/cancel/route.ts`
- `app/api/shifts/[id]/unclaim/route.ts`
- `app/api/household/route.ts`
- `app/api/household/admin/route.ts`
- `app/api/household/members/route.ts`
- `app/api/household/members/[id]/route.ts`
- `app/api/village/route.ts`
- `app/api/village/invite/route.ts`
- `app/api/village/invite-family/route.ts`
- `app/api/village/invite-family/accept/route.ts`
- `app/api/unavailability/route.ts`
- `app/api/feedback/route.ts`
- `app/api/notifications/route.ts`
- `middleware.ts` (if present)

## Domain 2 — Data integrity & schema

**Charter.** Verify Drizzle schema is the source of truth and is consistent with prod: no orphan columns, FK cascades are safe, soft-delete (`[deleted]` placeholder) honors spec non-negotiable #16b, the `(clerkUserId, householdId)` uniqueness invariant is enforced at the DB level, the enum migration (`inner_circle`/`sitter` → `covey`/`field`) is fully landed with no straggling literals, the migration journal is in sync with `information_schema` (the audit input flagged `0001_notification_prefs.sql` was applied directly to prod and not in the journal). Check the account-deletion DELETE handler is correct under concurrent member deletion.

**Seed files.**
- `lib/db/schema.ts`
- `lib/db/index.ts`
- `drizzle/` (all `.sql` migration files and `meta/_journal.json`)
- `app/api/account/route.ts` (DELETE handler — anonymization logic)
- `app/api/household/members/[id]/route.ts`
- `app/api/feedback/route.ts`
- `lib/auth/household.ts` (per-household identity creation path)
- `scripts/migrate-*.ts` (if present)

## Domain 3 — Notification delivery & observability

**Charter.** Verify every async side-effect emits a structured log line on success and failure (Hard Rule #3 + bar's `< 0.5% silent-failure rate`). Particular focus: `lib/notify.ts` and `lib/push.ts` — the audit input flagged 12 `.catch(() => {})` paths; verify they are gone. Verify the lantern silent-no-op (BUG-B root cause: empty inner circle) is now observable to the caller. Verify push failures (HTTP 410, 4xx, 5xx) update `push_subscriptions` correctly to prune dead endpoints. Verify Resend errors are logged (audit-10 fix). Verify cron escalation route is reachable and idempotent.

**Seed files.**
- `lib/notify.ts`
- `lib/push.ts`
- `lib/bell-escalation.ts`
- `app/api/bell/route.ts`
- `app/api/bell/[id]/respond/route.ts`
- `app/api/bell/[id]/escalate/route.ts`
- `app/api/bell/cron/route.ts`
- `app/api/shifts/route.ts`
- `app/api/shifts/[id]/claim/route.ts`
- `app/api/shifts/[id]/cancel/route.ts`
- `app/api/shifts/[id]/unclaim/route.ts`
- `app/api/push/subscribe/route.ts`
- `app/api/push/test/route.ts`
- `app/api/diagnostics/route.ts`
- `tests/diagnostics-lantern-recipients.test.ts`

## Domain 4 — API contract, validation, rate limiting

**Charter.** Verify input validation is consistent and complete on every write route: time-range validation (start < end, ISO format, reasonable bounds), UUID validation on path params, body-shape validation. Verify rate limiting on the three hot paths the spec/TODO call out (`/api/bell` POST, `/api/shifts` POST, `/api/shifts/[id]/claim`) and identify any other write path that should be rate-limited at 5K. Verify error keys are uniform (no `unauth` vs. `not_signed_in` vs. `Unauthorized` divergence). Verify `lib/format/time.ts` is the only time formatter — no per-screen reimplementations remain. Verify the `users.is_admin` field is actually checked in admin-gated routes.

**Seed files.**
- `lib/api-error.ts`
- `lib/format/time.ts`
- `lib/format.ts`
- `lib/ratelimit.ts`
- `app/api/bell/route.ts`
- `app/api/shifts/route.ts`
- `app/api/shifts/[id]/claim/route.ts`
- `app/api/shifts/[id]/cancel/route.ts`
- `app/api/shifts/[id]/unclaim/route.ts`
- `app/api/unavailability/route.ts`
- `app/api/household/admin/route.ts`
- `app/api/household/members/[id]/route.ts`
- `app/api/upload/route.ts`
- `app/api/feedback/route.ts`

## Domain 5 — PWA, service worker, push subscription lifecycle

**Charter.** Verify the PWA install path: `app/manifest.ts`, theme color, icon set, `apple-touch-icon`, `apple-mobile-web-app-capable` meta. Verify the service worker (`app/api/sw-script/route.ts`) handles `push` events, parses payload, falls back gracefully on JSON parse error (the `phase5-push-verification` plan mentions a `{ title: 'Covey', body: event.data.text() }` fallback), notification-click deep links work, cache version bumps invalidate old SWs. Verify `PushRegistrar` posts subscriptions correctly, subscriptions are reused not duplicated, dead subscriptions are pruned on 410 from the push provider. Verify `AutoUpdate` doesn't trap users on a stale SW.

**Seed files.**
- `app/manifest.ts`
- `app/layout.tsx`
- `app/api/sw-script/route.ts`
- `app/api/push/subscribe/route.ts`
- `app/api/push/test/route.ts`
- `app/components/PushRegistrar.tsx`
- `app/components/AutoUpdate.tsx`
- `app/components/InstallHint.tsx`
- `lib/push.ts`
- `public/icons/` (list contents only)

## Domain 6 — Performance & cost at 5K

**Charter.** Identify hot-path query patterns that won't scale: missing indexes on common WHERE columns, N+1 queries, oversized SELECT lists, full-table scans on joins, polling endpoints called by every visible tab (`/api/bell/active`), cold-start hits from heavy module imports, dynamic imports inside hot paths (`import('@/lib/push')` etc.). Estimate which routes will breach the p95 < 800ms bar at 100–200 concurrent users. Identify cache discipline gaps. Identify any path that fans out to all household members without bound (e.g., a 5K-household with 20 caregivers fanning push synchronously inside the request).

**Seed files.**
- `lib/db/schema.ts` (read for column types and existing indexes)
- `drizzle/` (read for index migrations)
- `lib/notify.ts`
- `lib/push.ts`
- `lib/bell-escalation.ts`
- `app/api/bell/route.ts`
- `app/api/bell/active/route.ts`
- `app/api/bell/cron/route.ts`
- `app/api/shifts/route.ts`
- `app/api/shifts/ical/route.ts`
- `app/api/account/route.ts`
- `app/api/diagnostics/route.ts`
- `app/components/AppDataContext.tsx` (if present — polling cadences)
- `app/components/HomesteadApp.tsx`
- `next.config.ts`
- `vercel.json`

## Domain 7 — Security & operational readiness

**Charter.** Combined domain because both surfaces are smaller than the others. **Security:** XSS surfaces (any `dangerouslySetInnerHTML` on user-controlled input), file upload (EXIF strip, content-type, size cap on `/api/upload`), env-var leak (no `process.env.*_SECRET` reaching the client bundle), blob URL exposure, ICS feed authentication (`/api/shifts/ical`), feedback POST (rate limit, size cap). **Operational readiness:** `/api/diagnostics` informativeness, Sentry integration health (`next.config.ts`), env-var documentation completeness, `package.json` scripts and engines pin, `vercel.json` cron+function config, build reproducibility (Turbopack APFS-cache surprises noted in audit input).

**Seed files.**
- `app/api/upload/route.ts`
- `app/api/feedback/route.ts`
- `app/api/shifts/ical/route.ts`
- `app/api/diagnostics/route.ts`
- `lib/strip-exif.ts`
- `next.config.ts`
- `vercel.json`
- `package.json`
- `app/layout.tsx`
- `app/components/HomesteadApp.tsx` (XSS surface check)
- `app/components/ScreenLantern.tsx` (user-input render check)
- `app/components/ScreenPost.tsx` (user-input render check)
- `app/components/ScreenSettings.tsx` (env-var/secret leak check)
- `.env.example` (if present)

## Sequencing

1. Auth & access — foundational; finds inform every later domain.
2. Data integrity & schema — the second foundation.
3. Notification delivery & observability — the hot path.
4. API contract, validation, rate limiting — depends on 1.
5. PWA, service worker, push lifecycle — depends on 3.
6. Performance & cost at 5K — depends on 1+2+3+4.
7. Security & operational readiness — last; benefits from prior domains' coverage.
