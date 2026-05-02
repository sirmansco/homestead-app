---
title: Launch fix batch 03 — User soft-delete tombstone service / FK safety
date: 2026-05-02
status: pending
governs: L9, L2 (delete-safety half)
parent-audit: docs/plans/launch-audit-2026-05-02/synthesis.md
batch-id: B3
prereqs: B2 (admin gate must exist before re-routing village delete)
unblocks: none
---

## Spec

A single `lib/users/tombstone.ts` service is the only path used to remove a `users` row. The service (a) detects authored history (`shifts.createdByUserId`, `bells.createdByUserId`) and either (i) anonymizes the row using the `[deleted]` placeholder pattern from `app/api/account/route.ts` (preserves FKs) or (ii) returns a typed `HasHistoryError` that callers translate to 409 with explicit reason; (b) under no circumstance issues a raw `db.delete(users)` that would trip `ON DELETE restrict`. After this batch, `grep -rn "db.delete(users)" app/api/` returns matches only inside `lib/users/tombstone.ts`. The two affected route surfaces (`app/api/household/members/[id]/route.ts:53` and `app/api/village/route.ts:98`) call the service instead.

**Done criteria:** Tombstone service exists; both routes call it; regression test asserts that DELETE against a user who authored shifts/bells returns a clean response (200 with anonymized row, OR 409 with explicit reason — pick one consistently) and never 5xx; account-deletion path continues to work as the canonical example.

**Out of scope:** Account-deletion concurrency (data-integrity F1's "multi-step cleanup outside transaction" tail observation) is left in place — it works today and the synthesis did not promote it; revisit only if the new service surfaces a regression.

## Conventions

Pattern scan (`app/api/account/route.ts` self-deletion path):
- Anonymization places `[deleted]` placeholder values for PII columns and clears Clerk-identifying columns; preserves `users.id` so FKs hold.
- The account route runs a series of `db.update(...)` and `db.delete(...)` calls in a sequence; not in a transaction. New service should still match this style for consistency, but is welcome to wrap in `db.transaction(async tx => ...)` if the new service has more steps than the existing path.
- Drizzle `count()` aggregate is the typical pre-check pattern used elsewhere in the codebase for "does this row have dependents."

## File map

- `lib/users/tombstone.ts` — new file. Exports `tombstoneUser(userId, opts)` returning `{ kind: 'anonymized' } | { kind: 'has_history', counts }`. Internally: count authored shifts/bells; if zero → hard delete; else anonymize.
- `app/api/account/route.ts` — refactor self-deletion to call `tombstoneUser()` (after verifying parity). This consolidates the pattern.
- `app/api/household/members/[id]/route.ts:53` — replace `db.delete(users)` with `tombstoneUser()`. Map `has_history` to 409.
- `app/api/village/route.ts:98` — same.
- `tests/user-delete-fk-safety.test.ts` — regression for L9.

## Graveyard

(empty)

## Anchors

- `app/api/account/route.ts` line 120 already comments on the anonymization-vs-delete decision and proves the pattern works; do not regress.
- `shifts.createdByUserId` and `bells.createdByUserId` `ON DELETE restrict` is the data-integrity guarantee that authored history cannot be silently lost; do not weaken to `set null` or `cascade` to "fix" the 5xx — that defeats the spec.

## Fragile areas

- `lib/db/schema.ts` FK declarations — do not edit in this batch.
- Account-deletion path is the canonical reference; refactoring it is a parity exercise. If the refactor risks regression, do steps 1-2-3 (new service + new callers) without touching `account/route.ts` and leave that consolidation for a follow-up.
- Concurrent member deletion (data-integrity F1 tail observation) — unchanged in this batch. If a follow-up reveals partial-state corruption, open a separate plan; don't bundle here.

## Regression tests required (Hard Rule #6)

- `tests/user-delete-fk-safety.test.ts` — for both `/api/household/members/[id]` DELETE and `/api/village/route.ts` DELETE: seed a user with one created shift and one created bell, attempt deletion, assert response is the chosen success-or-409 contract and never 5xx; verify shift/bell rows survive intact (anonymized createdBy still resolvable).
