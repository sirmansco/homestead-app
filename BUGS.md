## Active

- [ ] Lantern banner not appearing on caregiver Perch (ScreenShifts) — root cause partially identified: `loadActiveBell` was swallowing all errors silently (catch block with no log); non-ok responses also returned silently. Fixed in #27: errors now logged to console. Regression test added for multi-household caregiver bell visibility. **Still needs real-device repro to confirm the banner now appears — watch browser console for `[ScreenShifts] bell/active` warnings.**

## Fixed

- [x] Active-state button text invisible in dark mode — fixed in #6, verified via screenshot
- [x] Bell: misleading "+5 min if no answer" sitter rung copy — fixed in #5
- [x] Dark-mode sweep: hardcoded `#FBF7F0` tokens — fixed in #7
