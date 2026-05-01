## Active

## Fixed

- [x] Lantern banner not appearing on caregiver Perch (ScreenShifts) — root cause: `loadActiveBell` swallowed errors silently. Fixed architecturally in tab-switch refactor: ScreenShifts now reads `activeBell` from AppDataContext (shared, tested polling) instead of its own fetch. verified-by: AppDataContext is the same source driving the tab bar bell badge.
- [x] Active-state button text invisible in dark mode — fixed in #6, verified via screenshot
- [x] Bell: misleading "+5 min if no answer" sitter rung copy — fixed in #5
- [x] Dark-mode sweep: hardcoded `#FBF7F0` tokens — fixed in #7
