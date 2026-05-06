---
title: Plan — Unclaim with parent-as-gatekeeper, one-tap re-broadcast
created: 2026-05-04
plan-id: whistle-unclaim-parent-gatekeeper
session: brainstorm-2026-05-04 item 4
size: S (was sized S; reduced by prior work — most of the backend already exists)
status: scoped (awaiting build)
---

## Spec

End-to-end, after this change ships:

- A watcher who claimed a whistle can release it. The whistle returns
  to `status = 'open'` with `claimedByUserId = null` and
  `claimedAt = null`. The release form (with optional reason) stays.
- ONLY the parent (creator) is notified on release. The watcher pool
  is NOT auto-fanned. (This already matches `lib/notify.ts:227-268`.)
- The parent's view of an open-but-previously-claimed whistle exposes
  a single "Send back to The Covey" action that re-broadcasts the
  whistle to the eligible watcher pool — same notification path as
  initial post (`notifyShiftPosted`).
- If the parent does nothing, the whistle stays open and silent. No
  watcher sees it as a notification (they may see it on their next
  Open-tab refresh, but no push fires until the parent explicitly
  re-broadcasts).

**Non-goals (explicit):**
- No per-occurrence release on recurring whistles. Item is deferred
  to its own session per TODO.md "Per-occurrence release on
  recurring commitments [DEFERRED]".
- No 3-hour cutoff / "bail" framing. The brainstorm captured that
  for the recurring case; not in scope here.
- No re-notify-the-pool option. Parent is the only re-router.
- No change to the cancel flow — cancel and unclaim are different
  state transitions and stay separate.

## Conventions (codebase-local patterns observed)

Pattern scan over `app/api/whistles/[id]/unclaim/route.ts`,
`app/api/whistles/[id]/claim/route.ts`, `lib/notify.ts`,
`app/components/ScreenWhistles.tsx`, `app/components/ScreenPerch.tsx`:

- **Unclaim route already exists** at
  `app/api/whistles/[id]/unclaim/route.ts`. It validates the caller
  is the claimer, atomically transitions `claimed → open`, and calls
  `notifyShiftReleased(id, claimer.id)`. It accepts an optional
  `reason` body field but does NOT currently persist or forward the
  reason. (Reason is consumed in the UI but discarded server-side.)
- **`notifyShiftReleased`** (lib/notify.ts:227) sends a push to the
  whistle creator (parent) only. It respects the creator's
  `notifyShiftReleased` preference. No fan-out.
- **Release UI exists in `ScreenWhistles.tsx`:** `ReleaseForm`
  (line 39) collects an optional reason and calls
  `unclaim(id, reason)`. The button label reads "Release."
- **Parent's view of whistles** is `ScreenPerch.tsx`. Today it
  renders posted whistles by status; it does not have a
  re-broadcast affordance for whistles that returned to `open`.
  Read the file during build to confirm where the action attaches.
- **Notification helpers** are in `lib/notify.ts`. The pattern is:
  one async helper per event, optional preference gate on the
  recipient, push via `pushToUser` or `pushToUsers`, optional
  follow-on email.

## File map

Files this plan modifies:

1. **New route:** `app/api/whistles/[id]/rebroadcast/route.ts`
   - POST. Auth: `requireUser` + verify caller is the whistle's
     creator (`whistles.createdByUserId`). Atomic gate:
     `WHERE status = 'open'` (no-op if already claimed). On success:
     call existing `notifyShiftPosted(id)` (or whatever the post-
     time notification helper is — confirm name during build).
   - Rate limit: 5/min/user/whistle to prevent spam re-broadcasts.
   - Pattern: mirror `claim/route.ts` shape (UUID validation, auth,
     atomic update, notify, error handler).

2. `app/components/ScreenPerch.tsx`
   - On a parent-side whistle card where `status === 'open'` AND
     `claimedByUserId` is null AND there's evidence this whistle
     was previously claimed (one of: a non-null
     `previously_claimed_at` audit field, OR the existence of a
     prior `claimedAt` cleared by unclaim — see open question
     below), surface a "Send back to The Covey" action.
   - On tap: POST to the new rebroadcast route. Optimistic UI:
     button → "Sent" briefly, then refresh.
   - If we cannot distinguish "just-released open" from "always-
     was open" without a schema change, simplify to: "Send back
     to The Covey" button is visible on ANY open whistle the
     parent posted. Tapping it just re-fires the notification. UX
     wise this is fine — parent re-pinging an idle whistle is a
     valid action.

3. `app/components/ScreenWhistles.tsx`
   - Confirm the Release button reads "Release" (today: yes).
     Brainstorm wording was "Unclaim"; "Release" is the current
     in-app term and matches the brand voice. Recommendation:
     keep "Release."
   - No other change in this plan (item 3's plan handles tab
     restructuring).

4. `lib/notify.ts`
   - Verify `notifyShiftPosted` (or the equivalent at-post-time
     helper — confirm name during build) can be called multiple
     times for the same shift without duplicate-suppression
     issues. If it suppresses, add a re-broadcast variant or pass
     a flag.

5. `tests/`
   - New: `tests/whistles-rebroadcast.test.ts`.
     - Only the parent (creator) can rebroadcast. Other parents in
       the same household → 403. Watchers → 403. Unrelated users
       → 403.
     - Rebroadcast on a `claimed` whistle → 409.
     - Rebroadcast on an `open` whistle → 200, calls
       `notifyShiftPosted` (assert via mock or spy).
     - Rate limit: 6th request in a minute → 429.
   - Existing `tests/auth-access-shift-claim.test.ts` and any
     unclaim coverage (verify if a test file for the unclaim route
     already exists; if not, add minimal coverage):
     - Only the claimer can unclaim. Other watchers, creator,
       unrelated → 403.
     - Unclaim on `open`/`done`/`cancelled` → 409.
     - Unclaim on `claimed` → 200, fires `notifyShiftReleased`,
       no fan-out to watcher pool (assert via mock that
       `notifyShiftPosted` is NOT called on the unclaim path).

## Anchors (must not break)

- Existing unclaim route stays functional.
- Existing release UI in `ScreenWhistles.tsx` stays functional.
- `notifyShiftReleased` continues to fire on unclaim.
- Watcher pool continues to receive NO automatic notification on
  unclaim. (This is a regression risk — guard with a test.)
- Cancel flow (`/api/whistles/[id]/cancel`) is independent and
  untouched.

## Fragile areas

- **Notification idempotency.** Re-calling `notifyShiftPosted`
  after a release-then-rebroadcast must not produce a
  "duplicate-suppressed" silent failure. Watch the helper's
  internal logging. If it has a same-tag-suppression, this is a
  bug we have to handle.
- **Recurring whistles.** A recurring whistle that gets unclaimed
  is currently undefined behavior in this plan. Confirm during
  build whether unclaim on a recurring whistle is even reachable.
  If yes, document the behavior; if no, gate with a 400.
- **Race: rebroadcast vs. claim.** Parent taps "Send back" the
  same instant a watcher claims it. The atomic
  `WHERE status = 'open'` gate handles this — the rebroadcast
  becomes a no-op (rows = 0) and we return 409. UI surfaces
  "Already claimed" and refreshes.
- **Empty Covey at rebroadcast.** Same edge as initial post: if
  no one is in `villageGroup = 'covey'`, the watcher pool is
  empty. The post-time helper should already handle this
  (probably skips silently). Confirm during build.

## Open questions (resolved)

1. **Distinguish "just-released open" from "always-was open"?**
   Resolved 2026-05-06: option (b) — added `released_at` column.
   Send-Back appears ONLY on whistles that were claimed-then-released
   (status='open' AND released_at IS NOT NULL). Migration is hand-
   written (0017) to avoid the Drizzle snapshot-drift blocker.

2. **Post-time helper name.** Resolved: `notifyNewShift`
   (lib/notify.ts:74), called from `app/api/whistles/route.ts:287`.

3. **Persist the release reason.** Resolved 2026-05-06: yes.
   `notifyShiftReleased` now accepts `reason?: string | null` and
   appends to push body when non-empty.

4. **Authorization scope on rebroadcast.** Resolved 2026-05-06:
   any keeper in the household (not just the original creator).
   A co-keeper can rebroadcast a released whistle.

## Graveyard

(empty at start)

## Success criteria (test plan)

1. Manual (two accounts): parent posts whistle. Watcher claims
   it. Watcher releases (with reason). Parent receives push:
   "Watcher released your Whistle" — body includes reason if
   provided.
2. Manual: parent's Perch view shows the whistle as open with a
   "Send back to The Covey" button.
3. Manual: parent taps "Send back." Watcher (and rest of pool)
   receive a fresh shift-posted push.
4. Manual: rate-limit triggers on 6th rebroadcast within a
   minute (429).
5. Manual: watcher pool receives ZERO push when watcher
   releases (only parent gets pinged).
6. New regression tests pass.
7. Existing whistles + notify tests pass.

## Branch + PR

- Branch: `feature/whistle-rebroadcast-parent-gatekeeper`
- PR title: "Whistle rebroadcast: parent as gatekeeper after release"
- PR body uses the Protos PR template.
