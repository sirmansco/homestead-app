## Plan — UI pass: ScreenShifts grouping, tab bar regression, WhenPicker midnight fix

**Date:** 2026-04-29

### Spec

1. **ScreenShifts — group by date:** The screen is correctly scoped to "committed shifts I can release." Add date-section headers so shifts are grouped by day (Today / Tomorrow / day-of-week / date). No change to the screen's purpose or the Release flow.
2. **Tab bar jump — root-cause:** Diff `a1df1b1..HEAD` on `shared.tsx` and `HomesteadApp.tsx`. No layout changes present — the only diff is the diagnostics screen addition. Root cause is `position: fixed` GTabBar inside a `position: fixed; inset: 0` outer shell combined with iOS Safari's handling of `env(safe-area-inset-bottom)`. Fix: move GTabBar outside the outer fixed shell so it's a true sibling at the root, OR wrap mobile layout so the tab bar is in a separate fixed layer at document level rather than inside the app shell. Actual approach: remove GTabBar from inside the outer shell and render it outside as a direct child of the `HouseholdProvider` wrapper. The tab bar is already `position: fixed; bottom: 0`, so this is cosmetically identical but avoids any stacking context inheritance from the outer shell.
3. **WhenPicker midnight auto-advance:** In `handleEndTime` (WhenPicker.tsx:160), if the resulting end datetime ≤ start datetime, advance end date by +1 day before calling `onChange`.

### File map

- `app/components/ScreenShifts.tsx` — add date-grouping headers above shift groups
- `app/components/HomesteadApp.tsx` — move GTabBar outside the inner fixed shell in mobile layout
- `app/components/WhenPicker.tsx` — fix `handleEndTime` to auto-advance end date past midnight

### Graveyard

(empty at start)

### Anchors

- ScreenShifts Release flow (first tap → ReleaseForm, second tap → POST /unclaim) must not break
- Tab bar navigation and badge count must not break
- WhenPicker preset chips and date/start-time handlers must not be affected

### Fragile areas

- `env(safe-area-inset-bottom)` is only meaningful when the outer HTML has `viewport-fit=cover` in the meta tag. Check `app/layout.tsx` before making assumptions about safe area behavior.
- WhenPicker is used in both ScreenPost (noPresets=true) and ScreenBell — regression-test both call sites mentally after the fix.
