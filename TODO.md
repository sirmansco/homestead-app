---
title: Covey — TODO / Deferred Work
purpose: Backlog of items deferred from prior sessions. Per Protos v9.7 §"Standard project file paths".
---

## Next session — start here (updated 2026-05-06)

Session 6 (2026-05-06) merged 10 PRs to main: B6, B7, B8, the Q-batch (Q1–Q8 as one PR), and C1–C6. The full P1 batch from Sessions 4–5 is now complete. Remaining backlog is small. Recommended order for the next session:

1. **iOS push telemetry plan** (`docs/plans/push-notifications-meredith-iphone.md` Phase 0). The push pipeline prereqs — B6 dedupe, B7 deep-link, B8 claimer-confirmation — all shipped. Originally planned as the post-P1-batch session; now unblocked.
2. **Phase-5 recent-auth on `DELETE /api/account`.** Still wanted but blocked by Clerk's `reverification` claim being in public beta. Either wait for GA or pick alternate fresh-auth (e.g. "type your password to confirm" Clerk component) — see the "Recent-auth gate" section below for the full brief.
3. **Drizzle snapshot drift chore.** Standalone PR — only matters when the next migration is needed. Defer until then.

### Phone-side verification owed (Session 6 items merged unverified)

The B7 deep-link and the visual Q-batch items were merged without on-device verification per user direction. If any behave wrong, `git revert` is the fast path — both are squash-merges.

- [ ] **B7 deep-link** — push tap → app opens AND the matching ShiftCard scrolls into view + amber-rings for ~5s. Test: post + claim two whistles on the same household, tap a "covered" push, verify the right card highlights. Revert: `git revert 160e368`.
- [ ] **Q1 rotate calendar URL** — Settings → "Get calendar feed URL" → "Rotate URL" → confirm prompt → success. Old token URL should now 401; new URL serves the ICS feed. Revert: `git revert 573bfa0` (rolls back the whole Q-batch).
- [ ] **Q3 dark splash** — install PWA in iOS system dark mode, force-quit, cold-launch. Splash should be dark, no cream flash before paint.
- [ ] **Q5 Perch lantern tint dark mode** — open Perch tab in dark mode while a lantern is active. Amber tint on the lantern card should be visible against the dark bg (not invisible — that was the pre-Q5 fallback bug).
- [ ] **Q7 Whistles star badge** — keeper posts a whistle targeting a specific watcher. That watcher's Whistles tab should show "★ Requested for you" pill above the title.

## Active

### Pending verification — brainstorm-2026-05-04 Items 3 + 4 (added 2026-05-06)

Both PRs merged: #117 (Open/Claimed tabs) and #123 (rebroadcast with parent gatekeeper). Migration 0017 needs to run against prod before Item 4 routes will work (`released_at` column).

#### Step 0 — Apply migration 0017 to production

```bash
cd "Apps/Covey/covey-app"
npm run db:migrate
```

Pre/post doctor checks gate the run. Verify column exists after:
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'whistles' AND column_name = 'released_at';
```

#### Test plan — dual-role single-account (run on prod after main redeploys)

Run as one Clerk account using the dual-role switch.

- [ ] **Test 1 — Open / Claimed tabs.** Switch to watcher. Whistles tabs read "Open" / "Claimed" (not "All"). Open is default. Tagline on Open: "Open requests from your circle." Tagline on Claimed: "[Whistles/Requests] you've claimed."
- [ ] **Test 2 — Claim moves whistle Open → Claimed.** Keeper posts whistle. Switch to watcher. Cover it. Card animates out of Open. Tap Claimed — whistle there with Release button. Tap Open — whistle NOT there.
- [ ] **Test 3 — Release with reason; push includes reason.** Watcher taps Release on claimed whistle, types "got a flat tire", confirms. Switch to keeper. Push body should read something like `"…released your Whistle — \"got a flat tire\""`.
- [ ] **Test 4 — Send Back gate (released vs fresh).** As keeper on Perch: released whistle's card shows TWO buttons (muted Cancel + filled Send Back). Post a fresh whistle (don't claim). Its card shows ONE button: just Cancel. No Send Back on fresh opens.
- [ ] **Test 5 — Send Back re-broadcasts.** Keeper taps Send Back on released whistle. Button → "Sending…" briefly. Switch to watcher — fresh new-whistle push received. Switch back to keeper, refresh Perch — Send Back button is gone (released_at cleared). Cancel remains.
- [ ] **Test 6 — Cancel still works.** Keeper taps Cancel on any whistle, confirms. Whistle disappears from Perch (regression check: cancel flow untouched by Item 4).

#### Test plan — requires two Clerk accounts (deferred until aliases set up)

Set up two test accounts via Gmail plus-aliasing (`mjsirmans+keeper-test@gmail.com`, `mjsirmans+watcher-test@gmail.com`) or iCloud Hide-My-Email. ~5 min one-time setup.

- [ ] **Test 7 — Co-keeper authorization.** Invite test-account-2 as a keeper in same household. Account-1 posts. Watcher claims + releases. Account-2 should see Send Back on the released whistle even though account-1 posted it. (Unit-tested in `tests/whistles-rebroadcast.test.ts`.)
- [ ] **Test 8 — Rate limit (5/min/user/whistle).** As keeper, tap Send Back rapidly across 6 release+rebroadcast cycles within 60 seconds. 6th attempt should return 429 (toast: "too many requests"). (Unit-tested.)
- [ ] **Test 9 — No fan-out on release.** Test-account-2 is a watcher who NEVER claims, app open on a second device. Account-1 (also watcher) claims + releases. Account-2 should receive ZERO push from the release event. Only the keeper gets pinged. (Unit-tested — this is the critical regression guard from Item 4's plan.)

If any of Tests 1-6 fail, the failure stays here as a bug; otherwise check off and remove the section.

### Recent-auth gate on `DELETE /api/account` (deferred from B3 in Session 4)

- [ ] **Recent-auth on account delete.** Session 4 shipped CSRF custom-header + per-user rate limit on `DELETE /api/account`, but deferred the `auth.has({ reverification })` piece originally specified in the B3 brief. Reasons: (1) Clerk's `reverification` claim is in public beta — the type doc says "not recommended for production use," and a breaking change would silently brick account deletion for all users since the gate fails closed. (2) No client-side reverification modal exists in `ScreenSettings.tsx` — gating the route without a UI flow to recover means users hit a 403 with no path forward. To ship this properly: (a) wait for Clerk to mark `reverification` GA OR pick an alternate fresh-auth strategy (e.g., a "type your password to confirm" Clerk component), (b) add the modal/inline UI in `ScreenSettings.tsx handleDelete` to trigger reverification before the DELETE call, (c) add `auth.has({ reverification: { level: 'first_factor', afterMinutes: 93 } })` to the route, fail-closed. Test: stolen-cookie request without recent fresh auth returns 403; legit flow with reverification completes.

### Other deferred items

- [ ] **Drizzle snapshot drift (chore).** `npx drizzle-kit generate` (no schema changes) produces a 35-line migration that drops + re-creates 11 FK constraints with old pre-rename names from migration 0013. Postgres `ALTER TABLE RENAME` does not rename associated FK constraint names — the snapshot at 0016 reflects the schema.ts (post-rename) names but prod still has the pre-rename constraint names. Any future migration generated by drizzle-kit will pull this drift in. Fix: dedicated chore PR that resyncs the snapshot OR runs the FK rename migration. Until done, hand-write any new migration SQL and skip the snapshot regeneration.

- [ ] **iOS push telemetry plan.** `docs/plans/push-notifications-meredith-iphone.md` Phase 0. Unblocked as of Session 6 (B6/B7/B8 all on main). Was the originally-planned next session after the P1 batch.

- [ ] **B2 partial unique index (option b).** Session 5 shipped B2 via transaction + `pg_advisory_xact_lock` (#111, `9a5cffa`). The alternative path — partial unique index on first-user-per-household — was deferred. Belt-and-suspenders if the advisory lock ever wedges; otherwise unnecessary. Defer indefinitely.

## Fixed

### Session 6 (2026-05-06) — full P1 batch

- [x] **B6 — push subscribe stale-endpoint cleanup.** PR [#113](https://github.com/sirmansco/covey-app/pull/113) (`3cde3f4`).
- [x] **B7 — push deep-link to specific whistle.** PR [#116](https://github.com/sirmansco/covey-app/pull/116) (`160e368`). Phone verification still owed (see top of file).
- [x] **B8 — confirmation push to claimer.** PR [#114](https://github.com/sirmansco/covey-app/pull/114) (`9dd0f9e`).
- [x] **Q1–Q8 — quick wins batch.** PR [#118](https://github.com/sirmansco/covey-app/pull/118) (`573bfa0`). Phone verification owed for Q1, Q3, Q5, Q7.
- [x] **C1 — remove "Design prototype Oct 2025" sidebar copy.** PR [#119](https://github.com/sirmansco/covey-app/pull/119) (`123cc12`).
- [x] **C2 — escalate rate limits (per-user 5/min + per-lantern 1/min).** PR [#120](https://github.com/sirmansco/covey-app/pull/120) (`4d73f1f`).
- [x] **C3 — respond uses requireHousehold + active-household match.** PR [#121](https://github.com/sirmansco/covey-app/pull/121) (`b525759`).
- [x] **C4 — invite routes derive origin from `NEXT_PUBLIC_APP_URL` only.** PR [#122](https://github.com/sirmansco/covey-app/pull/122) (`29403fc`).
- [x] **C5 — server-side `DEV_EMAILS` rename (with `NEXT_PUBLIC_DEV_EMAILS` fallback).** PR [#124](https://github.com/sirmansco/covey-app/pull/124) (`a2f3d6a`). Operational rollout described in PR body.
- [x] **C6 — package-lock.json name + version aligned with package.json.** PR [#125](https://github.com/sirmansco/covey-app/pull/125) (`fbdb521`).

### Session 5 (2026-05-04)

- [x] **B2 — first-user race in `lib/auth/household.ts:51`.** PR #111 (`9a5cffa`) — transaction + `pg_advisory_xact_lock`.

### Session 4 (2026-05-04)

- [x] **B3 — CSRF + recent-auth on `DELETE /api/account`.** Recent-auth piece still deferred (see Active).
- [x] **B4 — IP rate limits pre-Clerk.**
- [x] **B5 — Sentry PII scrubbing.**
