---
title: Plan — Watcher whistle tabs: Open / All → Open / Claimed
created: 2026-05-04
plan-id: whistle-tabs-open-claimed
session: brainstorm-2026-05-04 item 3
size: S
status: scoped (awaiting build)
---

## Spec

End-to-end, after this change ships:

- The watcher's whistle screen has two tabs labeled **Open** and **Claimed**
  (currently "Open" and "All").
- **Open tab:** unclaimed whistles in the watcher's eligibility pool,
  status `open`, future. A whistle that another watcher claims drops
  out of this tab on the next refresh.
- **Claimed tab:** whistles this specific watcher claimed, status
  `claimed`, future. Whistles claimed by other watchers do NOT appear
  here.
- A whistle resolved (`status` becomes `cancelled` or `done`, or the
  shift is in the past) drops out of both tabs.
- The parent (keeper) view of whistles is unchanged — keepers continue
  to see their own posted whistles via the existing `ScreenPerch` /
  parent flow. No history view is added or removed in this plan.

**Non-goals (explicit):**
- No schema change. Filtering is client-side based on existing
  `claimedByMe` flag and `shift.status`.
- No change to the parent-side whistle history view.
- No change to the unclaim action (covered by item 4 plan).
- No change to the eligibility pool — that's part of item 1's audit.

## Conventions (codebase-local patterns observed)

Pattern scan over `app/components/ScreenWhistles.tsx`, `app/context/AppDataContext.tsx`:

- **Two scopes feed the screen:** `village` (open whistles in the
  watcher's eligible pool) and `mine` (whistles this watcher
  claimed). They're fetched independently via
  `refreshWhistles('village' | 'mine')` (lines 232-236).
- **`claimedByMe` is a per-row boolean** computed by the
  `AppDataContext` provider. The screen reads it directly.
- **The current "All" tab unions Open + My** (line 336:
  `showMySection = filter === 'all'`). Both sections render in the
  same scroll view, with a `SectionDivider label="My ${tabLabel}"`
  between them.
- **`SegmentControl`** (line 193) is a local component, two
  hardcoded options with key `'open' | 'all'`. Renaming the keys
  changes the type signature; renaming labels only is cosmetic.

## File map

Files this plan modifies:

1. `app/components/ScreenWhistles.tsx`
   - `SegmentControl` (line 193): change the union type from
     `'open' | 'all'` to `'open' | 'claimed'`. Update the labels:
     `[{ key: 'open', label: 'Open' }, { key: 'claimed', label: 'Claimed' }]`.
   - `ScreenWhistles` body:
     - State `filter` type changes to `'open' | 'claimed'`.
     - `showMySection` becomes `filter === 'claimed'` (semantic rename).
     - When `filter === 'claimed'`, hide the Open section entirely;
       show only the My-Whistles section. Today the "All" tab shows
       both. The brainstorm calls for a clean separation.
     - `tagline` line (344): adjust copy. Today reads
       `filter === 'open' ? 'Open requests from your circle.' :
        'Open requests and ${tabLabel} you've claimed.'`. New:
       `filter === 'open' ? 'Open requests from your circle.' :
        'Whistles you\'ve claimed.'`.
   - The `SectionDivider label="My ${tabLabel}"` inside the
     My-Whistles section can stay or go — without an Open section
     above it on the Claimed tab, the divider is redundant.
     Recommendation: remove it for the Claimed tab; the masthead
     tagline does the job.

2. `tests/` — new test
   - Add `tests/whistles-tabs-open-claimed.test.ts` (or extend an
     existing whistles test). Assert:
     - Open tab filters: `status === 'open' && !claimedByMe && endsAt
       in future`.
     - Claimed tab filters: `claimedByMe && status === 'claimed' &&
       endsAt in future`.
     - A whistle with `status === 'done'` or `status === 'cancelled'`
       does not appear in either tab.
     - A whistle with `endsAt` in the past does not appear in either
       tab.
   - Test surface is the filter logic in `ScreenWhistles`. Either
     extract the filter into a pure helper (`filterOpenWhistles`,
     `filterClaimedWhistles`) and unit-test it, or keep the filter
     inline and use a component-render test. Recommendation: extract
     to pure helpers in the same file. Cheaper to test.

## Anchors (must not break)

- The existing claim flow continues to work (`claim()` function,
  line 286).
- The existing unclaim/release flow continues to work (`unclaim()`
  function, line 304). The Release button still appears on
  Claimed-tab cards.
- The `animateOut` animation on claim/unclaim continues to work.
- `activeBell` lantern banner continues to render at the top.

## Fragile areas

- **Filter union type narrowing.** Changing `'open' | 'all'` to
  `'open' | 'claimed'` will surface every place the type is read.
  TypeScript will flag them. Don't suppress the errors — fix each
  reference.
- **Empty-state copy.** Today the Claimed-tab empty state reads
  "Nothing claimed yet" (line 443). That's already correct for the
  new framing.

## Open questions (resolve before build)

1. **Tab order:** Open then Claimed (mirrors current Open/All), or
   Claimed then Open? Recommendation: Open first. Watchers spend
   most time scanning what's available, not what they already have.
2. **Badge count on Claimed tab:** show the count of claimed-by-me
   whistles next to the tab label? E.g., "Claimed (2)". The
   masthead's `right={myRows.length > 0 ? '${myRows.length} mine'
   : ''}` (line 342) already conveys this. Skip the badge on the
   tab itself. Recommendation: skip.

## Graveyard

(empty at start)

## Success criteria (test plan)

1. Manual: open the watcher whistle screen. Tabs read "Open" and
   "Claimed."
2. Manual: claim an open whistle. It animates out of Open. Tap
   Claimed. The whistle is there.
3. Manual: have a second watcher account claim a different open
   whistle. The first watcher's Open tab no longer shows it. The
   first watcher's Claimed tab does NOT show it.
4. Manual: cancel or finish a claimed whistle. It disappears from
   Claimed.
5. New regression test passes.
6. Existing whistles tests pass.

## Branch + PR

- Branch: `feature/whistle-tabs-open-claimed`
- PR title: "Whistle tabs: Open / Claimed for watchers"
- PR body uses the Protos PR template.
