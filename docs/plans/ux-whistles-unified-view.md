---
title: UX — Unified Whistles View (caregiver)
created: 2026-05-02
status: specced
---

## Spec

**Problem:** Caregivers currently navigate two separate tabs — "Open Whistles" (available to claim, scope=`village`) and "My Schedule" / "Whistles" (claimed by me, scope=`mine`). This splits a single mental model (my engagement with Whistles) across two navigation surfaces. A caregiver must tab-hop to see whether they've already claimed something or to find new ones.

**Goal:** Merge both views into a single `ScreenShifts` tab experience. Open Whistles appear at the top. Claimed Whistles appear below a divider. A filter control lets the user narrow to open-only or see everything.

**Users:** Caregivers. Parents continue to see the Perch / schedule view unchanged (their tab shows shifts posted for their household, not this screen — their entry point is `ScreenAlmanac`).

**Functional requirements:**
1. On load, screen fetches both `village` scope (open, claimable) and `mine` scope (claimed by me) in parallel.
2. Default filter is **Open** — shows only `village` rows with `status='open'` and `endsAt >= now`.
3. Filter toggle has two states: **Open** | **All**. "All" shows open rows first, then a "My Whistles" section below a divider showing future claimed rows.
4. Claiming a Whistle from the Open section animates it from the Open section into "My Whistles" — optimistic local state move on claim success, CSS transition on the card, background re-fetch reconciles after.
5. Releasing a Whistle from "My Whistles" animates it back up to Open section (same optimistic pattern — move in local state on release success, re-fetch reconciles).
6. Lantern banner (if active) stays at the top, above the filter.
7. Empty state for each section is distinct: Open-empty = "No open Whistles right now"; MyWhistles-empty (visible only in All mode) = "Nothing claimed yet."
8. Loading state: skeleton/spinner while either scope is fetching on first load.
9. Filter state persists in component state only (not URL, not localStorage) — resets to Open on unmount.
10. Tab label and masthead title remain "Whistles" (from `getCopy().request.tabLabel`).

**Non-goals:**
- No change to parent-facing view (ScreenAlmanac / ScreenPost remain separate).
- No pagination — same data volume as today.
- No server change — reuse existing `?scope=village` and `?scope=mine` API endpoints.
- No SSE for the mine scope — polling on focus (existing AppDataContext behavior) is sufficient.

**Success criteria:** A caregiver opens the Whistles tab, sees open requests at the top, taps Cover, and sees it move to their section — without switching tabs. Verified by manual walkthrough on staging + regression tests for filter logic.

---

## Conventions

Observed from `ScreenShifts.tsx` and `ScreenAlmanac.tsx`:
- Shift data comes from `useAppData()` — `shifts`, `shiftsLoading`, `refreshShifts`.
- `ShiftCard` component is already built in `ScreenShifts.tsx` and handles claim/release/releaseForm.
- Date grouping via `groupByDate()` helper already in file.
- Masthead uses `GMasthead` with `leftAction={<HouseholdSwitcher />}`.
- Error toast: fixed-position, `role="alert"`, auto-dismiss 5s for claim errors, sticky for release errors.
- Section dividers use the `SectionHead` pattern (short rule + uppercase label + long rule).
- Filter/segment controls not yet present in this screen — use a two-button pill consistent with WhenPicker / existing tab-style in the app.

---

## File map

| File | Change |
|---|---|
| `app/components/ScreenShifts.tsx` | Full rewrite of the caregiver view — add filter state, fetch both scopes, render two sections |
| `app/components/shared.tsx` | Add `GSegmentControl` pill component if not already present (check first) |
| `app/context/AppDataContext.tsx` | No change — `refreshShifts('village')` and `refreshShifts('mine')` already work |
| `tests/screen-shifts-unified.test.ts` | New: filter logic, section rendering, optimistic move on claim |

Files outside this map: none expected. If `ScreenAlmanac.tsx` or `CoveyApp.tsx` need a change, stop and flag.

---

## Graveyard

(empty at start)

---

## Anchors

- `ShiftCard` component props interface must not change — it is used by both sections.
- `claim()` and `unclaim()` logic (including UX-5 release-error fix) must be preserved exactly.
- Parent view in `ScreenAlmanac.tsx` is untouched — this change is caregiver-only.
- `AppDataContext` shift polling on window focus covers re-sync after background tab returns.

---

## Fragile areas

- `ScreenShifts` currently only fetches `mine` scope. Adding `village` fetch changes the loading state shape — both scopes must be independently tracked so one slow fetch doesn't block the other section from rendering.
- `ShiftCard` renders a Release button when `mine=true` and a Cover button otherwise. The unified view passes `mine` based on which section the card is in, not based on the shift's `claimedByMe` field alone — these must stay in sync or a caregiver will see a Release button on an open shift.
- `releasingId` state is currently scoped to `ScreenShifts`. In the unified view, a release from "My Whistles" section must not affect rendering of the Open section.
