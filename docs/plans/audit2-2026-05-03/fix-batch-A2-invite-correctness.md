---
title: Audit-2 fix batch A2 — Invite correctness + expiry
date: 2026-05-03
status: planned
governs: F-P1-F, F-P1-G, F-P2-A
parent-audit: docs/plans/audit2-2026-05-03/fix-sequence.md
batch-id: A2
prereqs: none
unblocks: nothing (A1, A3, A4 are independent)
---

## Spec

After this batch:

1. **F-P1-F** — `POST /api/circle/invite-family/accept` validates that the signed-in user's
   email matches `invite.parentEmail` before consuming the token. If no match, returns 403
   `{ error: 'email_mismatch' }`. Additionally, `acceptedHouseholdId` is written from the
   caller's active household (resolved via `requireHousehold`) instead of
   `invite.acceptedHouseholdId` (which is always `null` on creation and is therefore never
   persisted correctly today).

2. **F-P1-G** — `familyInvites` gains an `expires_at` column (nullable timestamp, 72 h from
   creation). The GET preview and POST consume both return 410 `{ error: 'invite_expired' }`
   when `NOW() > expires_at`. New invites written by `POST /api/circle/invite-family` include
   `expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000)`. Existing rows with `expiresAt IS
   NULL` are treated as never-expiring (read-compat shim) so production tokens in-flight do not
   break.

3. **F-P2-A** — `POST /api/circle/invite-family` resolves `fromUserId` as the caller's users
   row **in the active household** rather than `users[0]` (first row across all households).
   Uses `requireHousehold()` to get `{ household, user }` and passes `user.id` directly.

**Done criteria:**

- `grep -n "users\[0\]" app/api/circle/invite-family/route.ts` returns no match.
- `POST /api/circle/invite-family/accept` with mismatched email returns 403 `email_mismatch`.
- A new invite row has `expires_at` set to approximately 72 h in the future.
- `POST` consuming an expired token returns 410 `invite_expired`.
- Migration `0013_family_invite_expiry.sql` is present and applies cleanly.
- Regression tests pass.

**Out of scope:** UI copy for expiry messages; email notification on invite creation (separate
feature); invite resend flow.

## Conventions

- `requireHousehold()` already returns `{ household, user }` — the user row is the caller's
  row in the active household. Use it directly for `fromUserId`.
- The `expiresAt` field is added as nullable in the DB so in-flight tokens (expiresAt IS NULL)
  remain valid. New code always writes a value; old rows keep their null.
- Expiry check: `invite.expiresAt !== null && invite.expiresAt < new Date()` — simple date
  comparison, no library needed.
- Clerk email is available on the `requireUser()` result via `clerkClient().users.getUser()`,
  but the caller's `users` row (returned by `requireHousehold()`) already has `user.email`
  populated from DB — use that. Avoids a second Clerk API call.
- Error key `email_mismatch` and `invite_expired` are new; return directly as 403/410 from
  the route. No change to `lib/api-error.ts`.

## File map

### `drizzle/0013_family_invite_expiry.sql` — new migration

```sql
ALTER TABLE family_invites ADD COLUMN expires_at timestamp;
```

### `lib/db/schema.ts` — `familyInvites` table

Add after `createdAt`:

```ts
expiresAt: timestamp('expires_at'),
```

### `app/api/circle/invite-family/route.ts` — POST handler

Replace `requireUser()` with `requireHousehold()`. Change `fromUserId` resolution:

```ts
// before
const { userId } = await requireUser();
// ...
const [me] = await db.select().from(users).where(eq(users.clerkUserId, userId)).limit(1);
if (!me) return NextResponse.json({ error: 'No user record' }, { status: 404 });
// ...
fromUserId: me.id,

// after
const { user } = await requireHousehold();
// ...
fromUserId: user.id,
expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
```

Remove the `users` import from `@/lib/db/schema` if it is no longer used. Keep the rate-limit
key using `user.clerkUserId` (same value as before).

### `app/api/circle/invite-family/accept/route.ts` — GET handler

Add expiry check after the `invite_used` guard:

```ts
if (invite.expiresAt !== null && invite.expiresAt < new Date()) {
  return NextResponse.json({ error: 'invite_expired' }, { status: 410 });
}
```

The GET select must include `expiresAt: familyInvites.expiresAt` in the projection.

### `app/api/circle/invite-family/accept/route.ts` — POST handler

Replace `requireUser()` with `requireHousehold()`. Add email validation and fix
`acceptedHouseholdId`:

```ts
// before
const { userId } = await requireUser();

// after
const { household, user } = await requireHousehold();
```

After the `invite_used` guard, add:

```ts
// Expiry
if (invite.expiresAt !== null && invite.expiresAt < new Date()) {
  return NextResponse.json({ error: 'invite_expired' }, { status: 410 });
}

// Email match: the signing-in user must be the invited parent.
if (user.email.toLowerCase() !== invite.parentEmail.toLowerCase()) {
  return NextResponse.json(
    { error: 'email_mismatch', message: 'This invite was sent to a different email address.' },
    { status: 403 },
  );
}
```

Fix `acceptedHouseholdId` in the UPDATE:

```ts
// before
acceptedHouseholdId: invite.acceptedHouseholdId,

// after
acceptedHouseholdId: household.id,
```

The `returning()` check on `updated.status !== 'accepted'` stays — it is the race guard.

## Graveyard

(empty)

## Anchors

- `requireHousehold()` auto-provisions a users row for new Clerk users on first call — the
  `user.email` field is populated from Clerk data at provision time and is therefore reliable.
- The `invite_used` 410 guard in both GET and POST stays as the primary consumed-token guard;
  expiry is a secondary time-based check added after it.
- `familyInvites.acceptedHouseholdId` was always NULL on creation — that column was never
  correctly populated. This batch is the first write to it.
- Rate-limit key stays scoped to the Clerk user ID (unchanged behavior).

## Fragile areas

- `requireHousehold()` auto-provisions. In the invite flow, the accepting user may not yet
  have a household — they are joining one via the invite. If `requireHousehold()` throws
  (no active org), the POST accept will fail. Consider whether this is acceptable:
  **decision: acceptable for now** — the accept page should direct the user through Clerk org
  join first. Document in the route comment.
- Drizzle migration 0013 adds a nullable column — safe on Postgres with no table rewrite.
  Run migration before deploying code that reads `expiresAt`.
- The `users` select in invite-family POST can be removed only after verifying no other code
  in that file still uses the `users` import. Do a final grep before removing the import.

## Regression tests required (Hard Rule #6)

### `tests/invite-family-correctness.test.ts` — new file

Covers F-P1-F and F-P1-G:

- `POST /api/circle/invite-family/accept` with matching email → 200 ok, `acceptedHouseholdId` set
- `POST /api/circle/invite-family/accept` with mismatched email → 403 `email_mismatch`
- `POST /api/circle/invite-family/accept` with expired token → 410 `invite_expired`
- `GET /api/circle/invite-family/accept` with expired token → 410 `invite_expired`
- `POST /api/circle/invite-family/accept` with valid non-expired token → 200 ok

### `tests/invite-family-from-user.test.ts` — new file

Covers F-P2-A:

- `POST /api/circle/invite-family` by a user who has rows in two households → `fromUserId`
  is the row in the active household, not the first row returned by the DB
