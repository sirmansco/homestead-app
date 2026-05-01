# Plan — Covey Visual Rebrand Polish (Sessions 1–3)

## Spec
Post-rebrand UI polish: copy corrections, icon alignment, dark mode fidelity, lantern functionality.

## File map
- `app/components/shared.tsx` — GMasthead, GTabBar, Icons
- `app/components/ScreenAlmanac.tsx` — BellButton (lantern icon + parent Masthead action)
- `app/components/ScreenShifts.tsx` — caregiver parent-view Masthead action
- `app/components/ScreenCircle.tsx` — rename modal copy
- `app/components/ScreenSettings.tsx` — notification pref label
- `app/components/ScreenLantern.tsx` — lantern active state display
- `app/guide/page.tsx` — dark mode + copy updates
- `lib/copy.covey.ts` — tagline copy
- `public/` — app icons

## Session 3 Queue
- [x] D1 — Restore lantern icon in parent Masthead (top-right) — was changed to bobwhite, revert
- [x] D2 — Wire lantern action to both parent pages (Almanac + Perch/Shifts)
- [x] D3 — Sign-in tagline: "the small, watching circle around your children" → "the small, watching circle around your chicks"
- [x] D4 — Parent tab bar: "Post" → "Whistle"
- [x] D5 — Rename modal: "Rename household" → "Rename Covey"
- [x] D8 — Notification pref: "Family rings the lantern" → "Family lights the lantern"
- [ ] D6 — Lantern lit not showing on The Perch (ScreenShifts) — audit with Codex
- [ ] D7 — Caregiver masthead dark mode glitch + bobwhite side-profile — audit with Codex
- [ ] D9 — Guide page dark mode unreadable — fix var(--bg) wiring
- [ ] D14 — App icon: update to side-profile bobwhite sentinel (Image #7)

## Graveyard
- D6 — Lantern banner on ScreenShifts (2026-05-01) — Code is wired correctly (poll + conditional render). Banner does not appear. Root cause unconfirmed: suspect `/api/bell/active` returns `{ bells: [] }` for caregiver session due to household auth resolution mismatch. Cannot fix without repro (network log from real caregiver device with active bell).

## Anchors
- Caregiver tab bar unchanged
- GTabBar role prop determines parent vs caregiver tabs
- LanternCard in ScreenAlmanac (parent view) is wired and working

## Fragile areas
- GMasthead rightAction prop — parent screens pass it differently; must not break caregiver masthead
- Dark mode: globals.css uses CSS custom properties; guide page uses hardcoded hex — that's the root cause of issue #9
- GTabBar "Post" label is hardcoded string (not from getCopy()) — safe to change directly
