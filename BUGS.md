## Active

- [ ] **BUG-B — Push notifications not firing.** Code-level pipeline is wired correctly (`pushToUsers` → `sendBatch` → `web-push`); cannot determine root cause without device + log evidence. Two prerequisite fixes shipped this session (audit items 10 + 19) so diagnostics and logs are now informative.
  - **Blocked — need from user:**
    1. Output of `GET /api/diagnostics` on the failing env (confirms `VAPID_PRIVATE_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_SUBJECT`, `RESEND_API_KEY` all `true`).
    2. Vercel runtime logs filtered to `push_batch` or `[push:vapid]` from a recent bell-ring attempt.
    3. `select count(*) from push_subscriptions where user_id = '<user>'` on prod.
    4. Device-side: confirm a `PushRegistrar` subscription POST exists in the network log.
    5. Confirm at least one intended recipient has `notifyBellRinging = true` in `users`.

## Fixed

- [x] **BUG-A — Lantern (active Bell) banner not appearing for caregivers on Almanac/"Open Whistles".** Root cause: `ScreenAlmanac.tsx` gated `<LanternCard>` with `role === 'parent' && activeBell`, so caregivers viewing Almanac never saw the active-Bell banner even though `AppDataContext` populated `activeBell` for them. The prior "Fixed" entry below only covered `ScreenShifts`; the Almanac gate was untouched. Fix: drop the role gate; `onCancel` is now optional and only passed when `role === 'parent'` (cancel remains parent-only). verified-by: `tests/lantern-caregiver-visibility.test.ts`.
- [x] **Audit item 10 — `lib/notify.ts` `send()` silently swallows Resend failures.** `await fetch(...)` was never inspecting `response.ok`. Fix: check `res.ok`, log `[notify:email] resend failed: status N body M`. verified-by: `tests/notify-resend-error-logging.test.ts`.
- [x] **Audit item 19 — `/api/diagnostics` checks the wrong VAPID env var.** Was reporting `VAPID_PUBLIC_KEY` (no prefix) which is unused; `lib/push.ts` consumes `NEXT_PUBLIC_VAPID_PUBLIC_KEY`. Fix: drop the legacy var, add `VAPID_SUBJECT` and `RESEND_API_KEY`. verified-by: `tests/diagnostics-vapid-keys.test.ts`.
- [x] Lantern banner not appearing on caregiver Perch (ScreenShifts) — root cause: `loadActiveBell` swallowed errors silently. Fixed architecturally in tab-switch refactor: ScreenShifts now reads `activeBell` from AppDataContext (shared, tested polling) instead of its own fetch. verified-by: AppDataContext is the same source driving the tab bar bell badge. (Note: this fix only covered ScreenShifts; ScreenAlmanac was BUG-A above.)
- [x] Active-state button text invisible in dark mode — fixed in #6, verified via screenshot
- [x] Bell: misleading "+5 min if no answer" sitter rung copy — fixed in #5
- [x] Dark-mode sweep: hardcoded `#FBF7F0` tokens — fixed in #7
