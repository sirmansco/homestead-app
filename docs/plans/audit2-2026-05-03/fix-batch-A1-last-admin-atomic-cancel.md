---
title: Audit-2 fix batch A1 — Last-admin guard + atomic cancel
date: 2026-05-03
status: planned
governs: F-P2-H, F-P1-E, F-P2-I
parent-audit: docs/plans/audit2-2026-05-03/fix-sequence.md
batch-id: A1
prereqs: none
unblocks: nothing (A2, A3, A4 are independent)
---

## Spec

After this batch:

1. **F-P2-H** — `POST /api/circle/leave` refuses if the departing user is the household's only admin.
   Returns 409 `{ error: 'last_admin' }` with a message prompting admin transfer first. The check
   runs inside `tombstoneUser`'s transaction so it is race-safe.

2. **F-P2-I** — `DELETE /api/household/members/[id]` refuses with the same 409 if the target is the
   household's only admin. Guard is in the route handler before `tombstoneUser` is called.

3. **F-P1-E** — `POST /api/whistles/[id]/cancel` UPDATE gains a status predicate so it cannot cancel
   an already-cancelled shift or a claimed shift that had its status changed between the SELECT and
   the UPDATE. The UPDATE becomes: `WHERE id = ? AND status != 'cancelled'`. The `already cancelled`
   guard at the SELECT stays as an early-exit, but the UPDATE is now the hard guarantee.

**Done criteria:**

- `grep -n "\.where(eq(shifts.id, id))" app/api/whistles/[id]/cancel/route.ts` returns no match
  (only the compound WHERE remains).
- `POST /api/circle/leave` returns 409 `{ error: 'last_admin' }` when the caller is the sole admin.
- `DELETE /api/household/members/[id]` returns 409 `{ error: 'last_admin' }` when the target is the
  sole admin.
- Regression tests pass.

**Out of scope:** Prompting the user in the UI to transfer admin (UX work, separate ticket); any
change to the admin transfer route itself.

## Conventions

- The `tombstoneUser` service in `lib/users/tombstone.ts` runs inside a `db.transaction`. The
  last-admin check for the leave path lives in `app/api/circle/leave/route.ts` before calling
  `tombstoneUser`, not inside the service itself. The service is generic (used by account deletion
  and member removal too); polluting it with a household-admin policy would violate single
  responsibility. The route owns that policy.
- `db.$count(users, and(...))` is the correct counting pattern — see
  `app/api/household/admin/route.ts` and `app/api/lantern/[id]/respond/route.ts` for examples.
- The cancel UPDATE uses `ne(shifts.status, 'cancelled')` from `drizzle-orm`. Import is already
  present (`eq`, `and` are imported; `ne` must be added to the `drizzle-orm` import).
- Error key `last_admin` is new. `authError` in `lib/api-error.ts` does not need to know about it —
  the routes return it directly as a 409. No change to `lib/api-error.ts`.

## File map

### `app/api/circle/leave/route.ts`

Before calling `tombstoneUser`, add:

```ts
// Guard: refuse if this user is the household's only admin.
const adminCount = await db.$count(
  users,
  and(eq(users.householdId, household.id), eq(users.isAdmin, true)),
);
if (adminCount === 1 && user.isAdmin) {
  return NextResponse.json(
    { error: 'last_admin', message: 'Transfer admin to another member before leaving.' },
    { status: 409 },
  );
}
```

New import needed: `users` from `@/lib/db/schema` (already imported via tombstone's transitive
graph, but the route itself does not import it — add the direct import).

### `app/api/household/members/[id]/route.ts` — DELETE handler

After resolving `target` (line ~27), add before `tombstoneUser`:

```ts
if (target.isAdmin) {
  const adminCount = await db.$count(
    users,
    and(eq(users.householdId, household.id), eq(users.isAdmin, true)),
  );
  if (adminCount === 1) {
    return NextResponse.json(
      { error: 'last_admin', message: 'Cannot remove the only admin. Transfer admin first.' },
      { status: 409 },
    );
  }
}
```

### `app/api/whistles/[id]/cancel/route.ts`

Change line 35:

```ts
// before
.where(eq(shifts.id, id))

// after
.where(and(eq(shifts.id, id), ne(shifts.status, 'cancelled')))
```

Add `ne` to the `drizzle-orm` import at line 2.

The `if (shift.status === 'cancelled')` early-exit guard (line 27) stays — it gives the client a
faster 409 without touching the DB. The UPDATE predicate is the authoritative guarantee.

### `tests/last-admin-guard.test.ts` — new file

Covers F-P2-H and F-P2-I:

- `POST /api/circle/leave` with sole admin → 409 `last_admin`
- `POST /api/circle/leave` with one of two admins → 200 (not blocked)
- `POST /api/circle/leave` with non-admin → 200 (not blocked)
- `DELETE /api/household/members/[id]` targeting sole admin → 409 `last_admin`
- `DELETE /api/household/members/[id]` targeting one of two admins → 200
- `DELETE /api/household/members/[id]` targeting non-admin → 200

### `tests/shift-cancel-atomic.test.ts` — new file

Covers F-P1-E:

- Cancel a shift that is `open` → 200, status becomes `cancelled`
- Cancel a shift that is already `cancelled` (SELECT returns `'cancelled'`) → 409 `already cancelled`
- Simulate UPDATE returning 0 rows (status predicate mismatch, e.g., status changed to `claimed`
  between SELECT and UPDATE) → 500 `cancel failed` (existing error path; verify it is reached, not
  a phantom 200)
- Cross-household cancel attempt → 403

## Graveyard

(empty)

## Anchors

- `tombstoneUser` service does not change in this batch — it is correct and complete.
- The existing `if (id === user.id)` self-removal guard in members DELETE stays; the last-admin check
  is additive.
- `requireHouseholdAdmin` is already the gate on members DELETE — last-admin check runs after the
  admin gate, not instead of it.
- The cancel `already cancelled` SELECT guard stays as a fast-path; it is not the atomicity
  guarantee.

## Fragile areas

- `db.$count` is a convenience on top of `db.select({ count: sql... })`. It is synchronous in tests
  when mocked — mock `db.$count` returning a number, not a Promise, in the test file.
- `ne` from `drizzle-orm` — confirm the import from the package, not a local definition.
- The leave route currently does not import `users` directly. Adding it requires the import to be
  from `@/lib/db/schema`, same as the rest of the codebase.

## Regression tests required (Hard Rule #6)

- `tests/last-admin-guard.test.ts` — all six cases above
- `tests/shift-cancel-atomic.test.ts` — all four cases above
