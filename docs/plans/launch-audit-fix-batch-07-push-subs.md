---
title: Launch fix batch 07 — Push subscription correctness
date: 2026-05-02
status: shipped
governs: L17, L18, L19
parent-audit: docs/plans/launch-audit-2026-05-02/synthesis.md
batch-id: B7
prereqs: none (independent)
unblocks: none
---

## Spec

After this batch:
1. **L18** — `push_subscriptions` table has a unique constraint on `(user_id, endpoint)`. `/api/push/subscribe` uses native upsert (`onConflictDoUpdate`). Fan-out sees one row per real subscription; duplicate notifications stop.
2. **L17** — `lib/push.ts:73-85` classifies Web Push response codes explicitly. Documented permanent failures (404, 410, and any provider-confirmed permanent 4xx) prune. Retryable (429, 5xx) retain. Classification appears in `push_batch` log.
3. **L19** — `app/api/sw-script/route.ts:66-74` notification-click handler resolves `data.url` against `self.location.origin` and calls `client.navigate(targetUrl)` then `client.focus()` for matched same-origin clients; `clients.openWindow(url)` for the no-client path.

**Done criteria:** Concurrent re-subscribes to the same `(user_id, endpoint)` produce one row. A bell ring fans out one push per real subscription. Push 410 still prunes; 429 retains. Notification click on a same-origin focused client navigates to the deep-link tab.

**Out of scope:** Subscription compression / fan-out batching beyond the dedup fix; SW cache version bump strategy.

## Conventions

Pattern scan:
- Drizzle table-level uniques use the `uniqueIndex(...)` pattern; reference the existing `users_clerk_user_household_unique` style.
- `onConflictDoUpdate` is the Drizzle-native upsert idiom; the codebase uses `db.insert(...).onConflictDoUpdate(...)` elsewhere — match that style.
- `lib/push.ts:73-85` already structures `stale` vs. `failed` counts in the return; classification fits the existing shape.
- Service worker is generated dynamically via `app/api/sw-script/route.ts`; the route returns text. Test it by evaluating the route's text in a `vm` sandbox or a happy-dom environment.

## File map

- `lib/db/schema.ts:88-96` — add `uniqueIndex('push_subscriptions_user_endpoint_unique').on(t.userId, t.endpoint)` to the table callback.
- `drizzle/00XX_push_subscriptions_unique.sql` — Drizzle-generated. Includes pre-step `DELETE FROM push_subscriptions WHERE id NOT IN (SELECT MIN(id) FROM push_subscriptions GROUP BY user_id, endpoint);` to deduplicate before applying the constraint.
- `app/api/push/subscribe/route.ts:22-31` — replace select-then-insert with `db.insert(...).onConflictDoUpdate(...)`.
- `lib/push.ts:73-85` — extend the status-code classification. Add a small enum `PushFailureClass = 'permanent' | 'retryable' | 'unknown'`. Log classification in the `push_batch` line.
- `app/api/sw-script/route.ts:66-74` — change the click handler.
- `tests/push-subscribe-upsert.test.ts` — regression for L18.
- `tests/push-pruning.test.ts` — regression for L17.
- `tests/sw-notification-click.test.ts` — regression for L19.

## Graveyard

(empty)

## Anchors

- Existing 404/410 pruning at `lib/push.ts:73-85` — preserve as the first classification rule.
- Service worker push payload parsing fallback (`{ title: 'Covey', body: event.data.text() }` per phase5-push-verification plan) — leave intact; this batch only changes the click handler.

## Fragile areas

- Backfill before constraint — duplicate rows must be removed before the unique index is created or the migration fails on prod. Use `MIN(id)` to keep the earliest row; consider keeping the most-recent row instead if `keys` differ across duplicates. Decide before merge.
- Provider-specific 4xx classifications — Web Push spec is RFC 8030; implementations vary. Cite source for any non-410/404 status added to the permanent list.
- `client.navigate()` may not exist in all browsers; fall back to `client.focus()` + post-message if not available.

## Regression tests required (Hard Rule #6)

Listed in the file map. Each asserts the falsifiable root cause from synthesis.
