## Active

- [ ] Lantern banner not appearing on caregiver Perch (ScreenShifts) when a bell is ringing — `/api/bell/active` may return empty for caregivers; needs repro with real caregiver session + network log to confirm root cause. Attempted 2× (sessions 2–3); banner code is wired correctly, suspect household auth resolution path for caregivers. **Requires browser devtools network tab on a real caregiver device.**

## Fixed

- [x] Active-state button text invisible in dark mode — fixed in #6, verified via screenshot
- [x] Bell: misleading "+5 min if no answer" sitter rung copy — fixed in #5
- [x] Dark-mode sweep: hardcoded `#FBF7F0` tokens — fixed in #7
