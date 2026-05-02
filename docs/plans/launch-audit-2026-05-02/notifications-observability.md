---
title: Launch audit — notifications-observability
date: 2026-05-02
domain: notifications-observability
auditor: codex
---

## Summary

I read the launch bar, prompt contract, Domain 3 charter, the notification/push seed files, cron/escalation routes, diagnostics, notification preferences, `vercel.json`, and the user schema. The old `lib/notify.ts` / `lib/push.ts` `.catch(() => {})` fire-and-forget pattern is mostly gone, and Resend errors are logged, but the lantern hot path still reports misleading delivery counts to callers and has silent early-return paths. The highest-risk finding is the Domain 2 enum straggler cross-link: legacy `inner_circle` / `sitter` values remain valid and insertable while notification queries only target `covey` / `field`, causing real recipients to be silently missed.

## Findings

### Finding 1 — Lantern caller-visible counts report success when no push was attempted or delivered
- **Severity:** blocks-launch
- **Root cause (falsifiable):** `notifyBellRing()` ignores the `PushResult` returned by `pushToUsers()` and returns `sent: innerCircle.length`, while `pushToUsers()` can return `attempted: 0` for users with no subscriptions or `failed: subs.length` when VAPID is missing.
- **Evidence:** `lib/notify.ts:267`-`lib/notify.ts:274` awaits `pushToUsers(...)` and returns `{ sent: innerCircle.length, eligible: innerCircle.length }` without inspecting the result; `lib/push.ts:57`-`lib/push.ts:58` returns `reason: 'vapid_not_configured'` with zero delivered; `lib/push.ts:147`-`lib/push.ts:155` returns `{ attempted: 0, delivered: 0 }` before logging when the caller supplies no user IDs or no subscriptions match.
- **Why it matters at 5K:** The launch bar requires Bell silent-no-op visibility to the caller; a parent can receive `notifySent > 0` even though no push endpoint was attempted or delivery was impossible.
- **Proposed fix (root cause):** Change notification helpers to return structured push outcomes (`eligibleUsers`, `attemptedSubscriptions`, `delivered`, `stale`, `failed`, `reason`) and have `POST /api/bell` surface those fields instead of synthesizing `sent` from eligible user count.
- **Regression test:** Add `tests/bell-notify-result.test.ts` asserting that a bell ring with eligible caregivers but zero `push_subscriptions` returns `notifySent: 0` or an explicit no-subscription reason, not `notifySent: eligible`.
- **Effort:** M
- **Cross-references:** Domain 2 D2 enum straggler amplifies this because legacy caregivers can also make the eligible set wrong.

### Finding 2 — Legacy village groups are still insertable but notification filters only match new group names
- **Severity:** blocks-launch
- **Root cause (falsifiable):** The database enum and auto-provision path still allow `inner_circle` / `sitter`, while bell notification and escalation queries only match `covey` / `field`.
- **Evidence:** `lib/db/schema.ts:6` defines `village_group` as `['inner_circle', 'sitter', 'covey', 'field']`; `app/api/bell/[id]/respond/route.ts:53` accepts Clerk metadata typed as `'covey' | 'field' | 'inner_circle' | 'sitter'`; `app/api/bell/[id]/respond/route.ts:60` inserts `meta.villageGroup || 'field'` without normalizing legacy values; `lib/notify.ts:257`-`lib/notify.ts:264` only selects bell-ring recipients where `users.villageGroup = 'covey'`; `lib/notify.ts:286`-`lib/notify.ts:293` only selects escalation recipients where `users.villageGroup = 'field'`.
- **Why it matters at 5K:** Households with legacy `inner_circle` caregivers will see the hot lantern path miss real recipients while returning a normal 200, which is user-visible notification data loss.
- **Proposed fix (root cause):** Normalize legacy values at every write boundary and migrate existing rows so only `covey` / `field` remain valid, then remove old enum values or add a database check/migration guard.
- **Regression test:** Add `tests/notification-village-group-normalization.test.ts` asserting that Clerk metadata `inner_circle` is persisted as `covey` and that `notifyBellRing()` includes the normalized caregiver.
- **Effort:** M
- **Cross-references:** Domain 2 D2 headline data-loss path.

### Finding 3 — Automatic bell escalation cron is not configured in repo deployment config
- **Severity:** blocks-launch
- **Root cause (falsifiable):** The cron route exists and is idempotent, but `vercel.json` has no `crons` entry to schedule `GET /api/bell/cron`.
- **Evidence:** `app/api/bell/cron/route.ts:7` defines `GET`; `app/api/bell/cron/route.ts:8`-`app/api/bell/cron/route.ts:10` requires `Authorization: Bearer ${CRON_SECRET}`; `app/api/bell/cron/route.ts:21`-`app/api/bell/cron/route.ts:30` processes due bells via `Promise.allSettled`; `lib/bell-escalation.ts:15`-`lib/bell-escalation.ts:20` uses `AND escalated_at IS NULL` as the idempotency guard; `vercel.json:1`-`vercel.json:3` contains only `buildCommand`.
- **Why it matters at 5K:** Bells that are not manually escalated will not automatically widen from covey to field after five minutes, breaking the lantern escalation behavior under real launch usage.
- **Proposed fix (root cause):** Add a Vercel cron entry for `/api/bell/cron` and ensure the scheduled request supplies the expected secret, or change the route to the platform-supported cron auth contract used by the deployment.
- **Regression test:** Add `tests/vercel-cron-config.test.ts` asserting `vercel.json` contains a `crons` entry for `/api/bell/cron`, and a route test asserting repeated cron calls escalate a due bell once.
- **Effort:** S
- **Cross-references:** None.

### Finding 4 — Notification side-effects still have silent no-op paths without structured success/failure logs
- **Severity:** should-fix
- **Root cause (falsifiable):** Several notification helpers return early for missing records, opted-out recipients, empty recipient sets, or no email configuration without emitting the structured success/failure log line required by the launch bar.
- **Evidence:** `lib/notify.ts:15`-`lib/notify.ts:16` returns from `send()` when Resend is missing or recipient list is empty; `lib/notify.ts:49` returns when the shift or household is missing; `lib/notify.ts:128`-`lib/notify.ts:135` returns when a claimed-shift notification lacks a claim target or the creator opted out; `lib/notify.ts:265` returns for an empty inner circle; `lib/notify.ts:294` returns for empty field escalation recipients; `lib/notify.ts:327`-`lib/notify.ts:328` returns when no parents are opted into bell responses.
- **Why it matters at 5K:** The reliability bar requires every push/email send path to be observable; these paths leave operations unable to distinguish expected suppression from a broken notification pipeline.
- **Proposed fix (root cause):** Introduce a shared notification result/log helper and require every notification function to emit one structured line with `event`, `context`, `status`, recipient counts, and suppression reason before returning.
- **Regression test:** Add `tests/notification-observability.test.ts` covering empty inner circle, opted-out creator, missing Resend key, and empty escalation set, asserting a structured log is emitted for each.
- **Effort:** M
- **Cross-references:** Finding 1 covers the caller-visible lantern subset of this broader observability gap.

### Finding 5 — Push cleanup only prunes 404/410, leaving other permanent 4xx failures to repeat
- **Severity:** should-fix
- **Root cause (falsifiable):** `sendBatch()` only treats HTTP 404 and 410 as stale subscriptions, while other Web Push 4xx responses are counted as failures and left in `push_subscriptions`.
- **Evidence:** `lib/push.ts:73`-`lib/push.ts:85` increments `stale` and queues deletion only for `statusCode === 404 || statusCode === 410`; `lib/push.ts:89`-`lib/push.ts:96` deletes only `staleIds`; `lib/push.ts:99`-`lib/push.ts:108` logs repeated failures but does not prune non-404/410 permanent 4xx endpoints.
- **Why it matters at 5K:** Bad endpoints that return permanent 4xx errors will be retried on every fan-out, inflating failure logs and degrading hot-path push reliability.
- **Proposed fix (root cause):** Classify Web Push status codes explicitly: prune documented permanent subscription failures such as 404/410 and any other provider-confirmed invalid-subscription 4xx, retain retryable 429/5xx, and include the classification in `push_batch`.
- **Regression test:** Add `tests/push-pruning.test.ts` mocking `webpush.sendNotification()` for 410, permanent 4xx, 429, and 500, asserting only permanent failures delete rows.
- **Effort:** S
- **Cross-references:** Domain 5 should re-check service-worker subscription lifecycle after this is fixed.

## Out-of-domain observations

- `app/api/notifications/route.ts:80` updates every `users` row for the Clerk identity, which matches the file comment at `app/api/notifications/route.ts:61`; I did not confirm the Domain 1 notification IDOR from this route surface.
- `app/api/bell/[id]/respond/route.ts:53`-`app/api/bell/[id]/respond/route.ts:61` also overlaps Domain 1's auto-provision role/metadata concern because it trusts Clerk public metadata for village grouping during user-row creation.

## What I did not check

- I did not run tests or hit routes; this was a static audit only, per the no-fix/no-server instruction.
- I did not read service worker files or client push registration components; those belong to Domain 5.
- I did not inspect production Vercel settings outside repo config, so an out-of-band cron could exist; the repo does not declare one.
- I used 22/25 file reads, plus targeted `rg` searches for swallowed catches, village-group filters, and notification call sites.
