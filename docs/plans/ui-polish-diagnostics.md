---
created: 2026-04-29
status: in-progress
---

## Spec

Three mechanical tasks:

1. **Scroll padding audit** — All scroll containers currently use flat `120px` bottom padding. Tab bar is `position: fixed`, height = 62px pill + 6px gap + ~34px safe area = ~102px total. 120px gives only ~18px breathing room. Bump all to `140px` for safe clearance.

2. **FIX-7 — Remove ScreenHome dead code** — `HomesteadApp.tsx` routes `'almanac'` to `ScreenAlmanac`; `ScreenHome` is imported but never rendered. Remove import and delete file after confirming no other importers.

3. **Diagnostics screen (Scope 2)** — Dev-only feature gated to `NEXT_PUBLIC_DEV_EMAILS`:
   - Part A: `GET /api/diagnostics/route.ts` — auth-gated, returns DB connectivity + row counts + env var presence + app SHA
   - Part B: `app/components/ScreenDiagnostics.tsx` — accessible from Settings via `onOpenDiagnostics` callback, only when `canSwitchRole === true`

## File map

- `app/components/ScreenAlmanac.tsx` — bump 120px → 140px
- `app/components/ScreenBell.tsx` — bump 120px → 140px (4 occurrences)
- `app/components/ScreenPost.tsx` — bump 120px → 140px
- `app/components/ScreenSettings.tsx` — bump 120px → 140px; add Diagnostics row + onOpenDiagnostics prop
- `app/components/ScreenShifts.tsx` — bump 120px → 140px
- `app/components/ScreenTimeOff.tsx` — bump 120px → 140px
- `app/components/ScreenVillage.tsx` — bump 120px → 140px (2 occurrences)
- `app/components/HomesteadApp.tsx` — remove ScreenHome import; add 'diagnostics' to TabId; wire onOpenDiagnostics; add diagnostics case to renderScreen()
- `app/components/ScreenHome.tsx` — DELETE
- `app/components/ScreenDiagnostics.tsx` — CREATE
- `app/api/diagnostics/route.ts` — CREATE

## Graveyard

(empty)

## Anchors

- Tab navigation (navigate() + TabId type) works for all existing tabs
- canSwitchRole gate is the single source of truth for dev features
- GTabBar stays unchanged — diagnostics is a screen, not a tab bar item

## Fragile areas

- `TabId` type in HomesteadApp.tsx drives URL param validation (`validTabs` array) — must add 'diagnostics' to both the type and the array
- ScreenSettings prop interface must be updated with the new optional callback
- Diagnostics API must check email against DEV_EMAILS, not just auth presence
