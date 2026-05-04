---
title: Plan — "Your Covey" → "The Covey" + Family/Covey/Field surfacing
created: 2026-05-04
plan-id: membership-the-covey-rename
session: brainstorm-2026-05-04 item 1
size: M
status: scoped (awaiting build)
---

## Spec

End-to-end, after this change ships:

- The Covey/Circle screen header reads "The Covey" (not "Your Covey").
- The keeper-facing screen renders three labeled sections, in this order:
  1. **Family** — parents (`appRole = 'keeper'`) + chicks, grouped together.
  2. **Covey** — watchers in `villageGroup = 'covey'`.
  3. **Field** — watchers in `villageGroup = 'field'`.
- Parents (keepers) appear ONLY in the Family section. They are removed from
  the Covey/Field tier rendering.
- Watcher (caregiver) view is untouched in this plan — `CaregiverVillage` /
  `FamilyCard` are out of scope here. (Hiding the watcher roster on the
  caregiver-side family card is the deferred item 2.)
- Audit confirms `appRole = 'keeper'` users are excluded from every whistle
  pickup eligibility path and every `notifyShiftPosted` recipient query. The
  audit produces a written one-line confirmation per code path. If any path
  fails the audit, fix it as part of this plan (it would be a bug, not a
  scope expansion).
- A new regression test demonstrates: a `keeper` row in `users` with
  `villageGroup = 'covey'` and `notifyShiftPosted = true` does NOT receive a
  shift-posted push for an open whistle in the same household, and is NOT
  returned by the eligible-pool query inside `/api/whistles/[id]/claim` if
  one exists at the route level (today the route gates by `claimer.role`,
  so the test asserts the 403 path).

**Non-goals (explicit):**
- No schema migration. `villageGroupEnum` stays as-is. No new "family" enum
  value. The Family section is a render-time grouping over existing data
  (`appRole = 'keeper'` + `chicks` table).
- No data backfill. Existing keeper rows are not migrated between
  `villageGroup` values; their `villageGroup` column simply stops being
  read by the parent-view tier render.
- No change to the lantern eligibility model.
- No change to the caregiver (watcher) view.
- No divorced-parent / non-intact-household work.

## Conventions (codebase-local patterns observed)

Pattern scan over `app/components/ScreenCircle.tsx`, `lib/copy.covey.ts`,
`app/api/circle/route.ts`, `app/api/whistles/[id]/claim/route.ts`,
`lib/notify.ts`:

- **Copy is centralised in `lib/copy.covey.ts` (and `lib/copy.legacy.ts`).**
  All UI strings are read via `getCopy()` from `@/lib/copy`. New
  strings/labels go in `lib/copy.covey.ts` under the appropriate key. A
  parallel string in `lib/copy.legacy.ts` exists for the brand-flag
  fallback path; both files must change in lockstep.
- **`circle.title` is the page-header string.** `circle.innerLabel` is the
  Covey-tier label string. They share the value "Your Covey" today, but
  they are NOT the same concept. Renaming the page header to "The Covey"
  must NOT also rename the Covey tier label — the tier is still called
  "Covey." This plan changes `circle.title` only; `innerLabel` keeps its
  current "Your Covey" value (or, if you prefer, becomes plain "Covey" —
  open question, see below).
- **Member rendering uses `MemberCard`** (lines 73–297 of `ScreenCircle.tsx`).
  The component already supports rendering with no `villageGroup` /
  `onChangeGroup` (kid cards do this — line 1018). New Family-section
  parent cards reuse `MemberCard` with no `villageGroup` prop.
- **Tier rendering loop is `(['covey', 'field'] as const).map(g => …)`**
  (line 961). After this change, the loop iterates the same array but
  filters `byGroup(g)` to `appRole === 'watcher'` only. The Family
  section is rendered above this loop, not inside it.
- **Eligibility is gated by `appRole`, not by `villageGroup`**, in the
  whistle claim route (`app/api/whistles/[id]/claim/route.ts:55-57`):
  `if (claimer.role !== 'watcher') return 403`. This is the load-bearing
  exclusion. The audit verifies this exclusion exists in every
  pickup/notification path.
- **Notification queries DO read `villageGroup`** in `lib/notify.ts:348`
  and `:390` (lantern paths) and elsewhere — they filter
  `inArray(users.villageGroup, ['covey', 'inner_circle'])` AND
  `eq(users.role, 'watcher')`. The role gate is what excludes keepers;
  villageGroup is the tier filter inside the watcher pool.
- **Legacy enum read-compat:** queries that filter on `villageGroup`
  include legacy values (`inner_circle` alongside `covey`, `sitter`
  alongside `field`). Do not remove these — the B4 backfill confirming
  zero legacy rows hasn't shipped. New code follows the same pattern.

## File map

Files this plan modifies:

1. `lib/copy.covey.ts`
   - `circle.title`: `'Your Covey'` → `'The Covey'`.
   - `circle.loadingState`: `'Loading your covey…'` → `'Loading The Covey…'`
     (or similar — copy review needed; flagged below).
   - Add `circle.familyLabel`: `'Family'`.
   - Add `circle.familyNote`: short tagline, e.g. `'Parents and chicks.'`
   - **Open:** decide whether `innerLabel` becomes `'Covey'` (cleaner with
     "The Covey" as page header) or stays `'Your Covey'`. See open
     questions.

2. `lib/copy.legacy.ts`
   - Mirror new `familyLabel` / `familyNote` keys with brand-flag-appropriate
     values. Verify `circle.title` legacy value is unaffected (it's
     "Inner Circle" — the rename only touches the Covey brand path).

3. `lib/copy.ts`
   - Add `familyLabel: string;` and `familyNote: string;` to the `circle`
     section of the `AppCopy` type.

4. `app/components/ScreenCircle.tsx`
   - In the keeper view (`ScreenCircle` body, ~line 766), introduce a
     Family section above the existing tier loop (line 961).
     - Family section renders: parents (filter `adults` to
       `role === 'keeper'`) and chicks together. Use `MemberCard` for
       each, no `villageGroup` / `onChangeGroup` prop.
     - Header: `<GroupHeader count={parentsCount + chicks.length}
       label={getCopy().circle.familyLabel}
       note={getCopy().circle.familyNote} />`.
     - Layout: parents first, chicks below, in a single bordered card
       (mirrors the Covey-section visual treatment, line 978-984 — the
       `g === 'covey'` styling).
   - Update the existing tier loop:
     - `byGroup(g)` becomes `byGroup(g).filter(a => a.role === 'watcher')`.
       (Or define `watchersByGroup(g)` for clarity. Keepers are removed
       from this rendering.)
   - Remove the standalone "Chicks" section (line 1014-1030). Chicks now
     render inside the Family section.
   - The Caregiver view (`CaregiverVillage`, `FamilyCard`) is NOT
     touched in this plan.

5. `app/guide/page.tsx`
   - Verify references to `t.circle.title` still read sensibly with the
     new string. Cosmetic-only.

6. `app/components/CoveyApp.tsx`
   - Verify references to `getCopy().circle.title` (lines 185, 322, 420,
     421) read sensibly. Tab label uses the same string. If the bottom-
     tab label "Your Covey" is too long for the tab bar, consider using
     a separate `circle.tabLabel` key — flagged in open questions.

7. `app/components/ScreenPost.tsx`, `app/components/ScreenPerch.tsx`,
   `app/components/ScreenLantern.tsx`
   - All use `getCopy().circle.title` in user-facing copy. Verify each
     reads sensibly with "The Covey" substituted. Read each reference,
     adjust the surrounding sentence if needed (e.g., "Posted to The Covey"
     vs. "Post to The Covey" — both work; sentence-level review only).

8. `tests/notify-outcomes.test.ts` (existing) + new test file
   - Add a regression test asserting a `keeper`-role user is not
     a recipient of `notifyShiftPosted` for an open whistle in their own
     household, even when their `villageGroup = 'covey'` and
     `notifyShiftPosted = true`. This is the load-bearing test.
   - Add a regression test asserting a `keeper`-role user calling
     `POST /api/whistles/[id]/claim` receives 403 (`no_access`) — the
     existing route already does this; we lock the behavior.

Files this plan AUDITS (read-only) and produces a written confirmation for:

A. `app/api/whistles/[id]/claim/route.ts`
   - Confirm: keeper cannot claim. (Today: `route.ts:55-57` — confirmed.)
B. `lib/notify.ts` — `notifyShiftPosted`, `notifyShiftClaimed`,
   `notifyShiftReleased`, `notifyShiftCancelled`, `notifyLanternLit`,
   `notifyLanternEscalated`, `notifyLanternResponse`.
   - For each, confirm the recipient query filters `role = 'watcher'`
     where pickup-eligibility is the intent.
C. `app/api/diagnostics/route.ts` — confirm any membership-derived
   recipient lists exclude keepers.
D. `app/api/lantern/[id]/respond/route.ts` — lantern is parallel logic;
   note the role/group filter even though out of scope.
E. `app/api/circle/route.ts` POST adult path — placeholder inserts use
   `role: 'watcher'`. Confirm.
F. `app/api/whistles/route.ts` — the whistle-list endpoint. Confirm
   the `village` and `mine` scopes do not surface whistles to keepers in
   ways that imply pickup eligibility (this is a list endpoint, not a
   notification path; expected to be a no-op).

Audit output lives at the bottom of this plan file under "Audit results"
when the audit runs.

## Anchors (must not break)

- Existing tier rendering (`covey` and `field` sections) continues to
  work for watcher members. Only the parent inclusion changes.
- `lib/village-group/normalize.ts` is untouched — the legacy-enum
  collapse stays in place.
- All `villageGroupEnum` reads in queries (with `inArray(['covey',
  'inner_circle'])` etc.) stay untouched.
- Caregiver view (`CaregiverVillage`, `FamilyCard`) is unchanged.
- Tests in `tests/village-group-normalization.test.ts`,
  `tests/notify-outcomes.test.ts`, `tests/auth-access-shift-claim.test.ts`,
  `tests/last-admin-guard.test.ts` continue to pass.
- The brand-flag legacy path (`lib/copy.legacy.ts` `circle.title = "Inner
  Circle"`) continues to work.

## Fragile areas

- **`lib/copy.legacy.ts` parallel updates.** If `lib/copy.ts` adds a
  required key to the `AppCopy` type, both `copy.covey.ts` and
  `copy.legacy.ts` must add the value or TypeScript will fail. Add to
  both in the same commit.
- **Legacy-enum reads.** Don't remove `'inner_circle'` or `'sitter'`
  from any `inArray` filter — the B4 backfill hasn't confirmed zero
  legacy rows. The audit must read but not modify these.
- **Sentence-level copy.** Substituting "The Covey" for "Your Covey" in
  templated strings can produce ungrammatical output (e.g., "Your Covey
  is quiet" → "The Covey is quiet" reads fine, but "Loading your covey…"
  → "Loading the covey…" is awkward). Read each templated reference
  carefully.
- **Tab label width.** "The Covey" is one character longer than "Your
  Covey." If `CoveyApp.tsx` bottom-tab labels truncate or wrap, that's
  a visual regression. Verify in browser.

## Open questions (resolve before build)

1. **`circle.innerLabel`:** stay as `'Your Covey'`, or change to `'Covey'`
   to match the cleaner "The Covey" page header? Recommendation: change
   to `'Covey'`. The page is "The Covey," the tier inside it is "Covey,"
   the wider tier is "Field." Crisp.
2. **`circle.tabLabel`:** today the bottom-tab label uses `circle.title`
   (which becomes "The Covey"). Consider adding a `circle.tabLabel: 'Covey'`
   for the bottom-tab specifically. Recommendation: yes, add it — the
   "The" prefix doesn't help in a 4-tab bar.
3. **Family section visual treatment:** match the Covey card treatment
   (bordered, paper-bg, padded), or use a different treatment to
   visually distinguish Family as the "anchor" tier? Recommendation:
   match the Covey card. Less novelty, less work.
4. **Empty state copy:** if a keeper has no chicks and is the only
   parent (solo keeper, pre-invite), the Family section shows just the
   keeper. That looks lonely but isn't broken. No empty-state needed.

## Graveyard

(empty at start)

## Audit results

(populated when the audit runs as part of build)

## Success criteria (test plan)

Run before considering the plan shipped:

1. Grep: `grep -rn "Your Covey" --include="*.tsx" --include="*.ts" app/ lib/`
   returns matches only in `lib/copy.legacy.ts` and `tests/` (asserting
   legacy or test-fixture strings) and intentional places (e.g.,
   `circle.innerLabel` if we kept it). Zero matches in user-facing copy
   files outside that allowlist.
2. Manual: open the Covey screen as a keeper. Header reads "The Covey."
   Three sections render: Family (parents + chicks), Covey (watcher
   members in covey group), Field (watcher members in field group).
3. Manual: keeper does NOT appear in their own Covey or Field section.
4. Audit results section in this plan is populated and every entry
   reads "✓ keepers excluded" or names a fix.
5. New regression tests pass.
6. Existing tests pass: `tests/notify-outcomes.test.ts`,
   `tests/village-group-normalization.test.ts`,
   `tests/auth-access-shift-claim.test.ts`.
7. Browser check: visit the screen as a watcher (caregiver view) and
   confirm `CaregiverVillage` renders unchanged.

## Branch + PR

- Branch: `feature/the-covey-rename`
- PR title: "Rename Your Covey → The Covey, surface Family/Covey/Field"
- PR body uses the Protos PR template (Thinking Path, What Changed,
  Verification, Risks, Model Used, Checklist).
