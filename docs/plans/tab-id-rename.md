---
title: Tab ID rename — almanac → perch, shifts → whistles
created: 2026-05-02
status: in-progress
---

## Spec
Rename the two code-level tab identifiers to match the post-rebrand screen names:
- `'almanac'` → `'perch'` everywhere (TabId type, default screen, tab arrays, icon key, copy deep link)
- `'shifts'` → `'whistles'` everywhere (same surfaces)
- `normalizeTabId` must add `'almanac'` and `'shifts'` as legacy mappings so push notifications already in flight with old values still land on the correct screen.

## Conventions
- TabId is a local string literal union — no enum, no import. Both HomesteadApp.tsx and shared.tsx declare their own local `type TabId`. Both must be updated.
- Icons object in shared.tsx uses the tab ID as the key name — `Icons.almanac` → `Icons.perch`, `Icons.shifts` → `Icons.whistles`.
- Deep link values in copy files are string literals: `deepLinkTab: 'almanac'` and `shiftsDeepLinkTab: 'shifts'`.
- Tests mock `getCopy()` with inline objects; these inline mocks contain `shiftsDeepLinkTab: 'shifts'` — update those too.

## File map
1. `app/components/HomesteadApp.tsx` — TabId, LegacyTabId, normalizeTabId, TAB_SCREENS, default screen, validTabs array, caregiverMap/parentMap, bell-refresh condition, NavTab type
2. `app/components/shared.tsx` — Icons keys (almanac→perch, shifts→whistles), GTabBar local TabId type, parentTabs/caregiverTabs id fields, Icons references
3. `lib/copy.homestead.ts` — `request.deepLinkTab` (currently 'almanac'), `request.shiftsDeepLinkTab` (currently 'shifts')
4. `lib/copy.covey.ts` — same two fields
5. `tests/notify-outcomes.test.ts` — inline getCopy mock: `shiftsDeepLinkTab: 'shifts'` → `'whistles'`, `deepLinkTab: 'requests'` stays (already not 'almanac')
6. `tests/notify-skip-logs.test.ts` — same inline mock update

## Graveyard
(empty at start)

## Anchors
- normalizeTabId existing mappings: `'village' → 'circle'`, `'bell' → 'lantern'` — must not change
- All screen component names unchanged (ScreenPerch, ScreenWhistles already renamed in PR #72)
- API routes, DB columns, Clerk org IDs untouched

## Fragile areas
- Two separate local `type TabId` declarations (HomesteadApp.tsx:28 and shared.tsx:205) — must update both
- `validTabs` array at HomesteadApp.tsx:248 includes both old and new names during the legacy window
- Tests reference `shiftsDeepLinkTab` by key name — the key name doesn't change, only the value
