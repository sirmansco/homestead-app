---
title: Covey — TODO / Deferred Work
purpose: Backlog of items deferred from prior sessions. Per Protos v9.7 §"Standard project file paths".
---

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

### Deferred from Session 4 (2026-05-04 — P1 batch)

Session 4 shipped B3 + B4 + B5 (account-delete CSRF/recent-auth, IP rate limits pre-Clerk, Sentry PII scrubbing) and explicitly deferred the rest of the P1 batch to keep scope bounded. All items are still wanted; carry them forward.

#### B-tier (security / correctness)

- [x] ~~**B2 — first-user race in `lib/auth/household.ts:51`.**~~ Shipped Session 5 in #111 (`9a5cffa`) via transaction + `pg_advisory_xact_lock`. Partial unique index path (option b) deferred — separate PR after the Drizzle snapshot drift chore lands.

- [ ] **B6 — push subscribe dedupe (`app/api/push/subscribe/route.ts`).** On subscribe, also `DELETE FROM push_subscriptions WHERE userId = ? AND household_id = ? AND endpoint != ? AND created_at < now() - interval '60 seconds'`. Test: reinstall PWA, only one active subscription remains.

- [ ] **B7 — push deep-link whistleId (`lib/copy.covey.ts` request.deepLinkTab + `app/components/CoveyApp.tsx`).** Include `whistleId` query param in push URL when `notifyShiftClaimed` fires. Client parses `?whistle=<id>` on visibilitychange + focus + mount, scrolls/highlights matching `ShiftCard`. Test: two open whistles, claim one, push lands → correct one is highlighted. **Riskiest item in the batch — needs real browser verification, not just code review.**

- [ ] **B8 — confirmation push to claimer (`app/api/whistles/[id]/claim/route.ts:82`).** Send a confirmation push to the watcher who claimed it (separate from the keeper-notification). Test: claim succeeds → claimer gets a push within the response.

#### Q-tier (single PR, ~1 hr — quick wins)

- [ ] **Q1 — calToken rotation endpoint (`DELETE /api/whistles/ical/token`).** Nulls + regenerates `row.calToken`. Add "Rotate calendar URL" button in `ScreenSettings` calendar section.
- [ ] **Q2 — `lib/notify.ts` email send: add `Reply-To: keeper@household` header.**
- [ ] **Q3 — `app/manifest.ts`: change `background_color` to neutral or dark token.** Verify standalone-mode cold launch in dark mode no longer flashes cream.
- [ ] **Q4 — sign-up + setup pages: replace hardcoded hex with CSS vars.** `app/sign-up/[[...sign-up]]/page.tsx`: `#E8DFCE → var(--bg)`, `#4A5340 → var(--green)`, `#7A6A4F → var(--muted)`, `#F4EFE3 → var(--paper)`. `app/setup/page.tsx`: `#fff → var(--paper)`.
- [ ] **Q5 — `app/globals.css`: define `--mustard-rgb` in both light + dark blocks.** Verify `ScreenPerch.tsx` `LanternCard` amber tint renders correctly in dark.
- [ ] **Q6 — `app/components/ScreenWhistles.tsx:11` `fmtWhen`:** branch on hour — before 5pm "Today", after 5pm "Tonight".
- [ ] **Q7 — `app/components/ScreenWhistles.tsx` `ShiftCard` (Watcher view):** add the "Requested for you" star badge for targeted shifts. Mirror Perch implementation.
- [ ] **Q8 — move module-level `getCopy()` calls inside component bodies.** `app/components/ScreenSettings.tsx:18` (`PREF_LABELS`) and `app/accept-family-invite/page.tsx:14` (`GROUP_LABEL`). Test: brand-flag flip mid-session updates labels on next render.

#### C-tier (cleanup, ~1 hr)

- [ ] **C1 — `app/components/CoveyApp.tsx:485`:** remove "Design prototype Oct 2025" desktop sidebar copy.
- [ ] **C2 — `app/api/lantern/[id]/escalate/route.ts`:** add per-user (5/min) and per-lantern (1/min) rate limit on manual escalation.
- [ ] **C3 — `app/api/lantern/[id]/respond/route.ts`:** replace `requireUser` with `requireHousehold` so a Clerk-org member who hasn't been provisioned in DB hits onboarding instead of auto-creating a row.
- [ ] **C4 — `app/api/circle/invite/route.ts:42` + `invite-family/route.ts:42`:** derive origin from `process.env.NEXT_PUBLIC_APP_URL` only; ignore request `Origin` header.
- [ ] **C5 — `NEXT_PUBLIC_DEV_EMAILS` rename:** rename to `DEV_EMAILS` server-side, expose via `/api/me` or similar lightweight gating endpoint for client UI. OR confirm production env value is empty and document the operational invariant in SHIPLOG.
- [ ] **C6 — regenerate `package-lock.json`** (rm + `npm install`) so `name` matches `package.json`. Confirm no other diffs.

### Recent-auth gate on `DELETE /api/account` (deferred from B3 in Session 4)

- [ ] **Recent-auth on account delete.** Session 4 shipped CSRF custom-header + per-user rate limit on `DELETE /api/account`, but deferred the `auth.has({ reverification })` piece originally specified in the B3 brief. Reasons: (1) Clerk's `reverification` claim is in public beta — the type doc says "not recommended for production use," and a breaking change would silently brick account deletion for all users since the gate fails closed. (2) No client-side reverification modal exists in `ScreenSettings.tsx` — gating the route without a UI flow to recover means users hit a 403 with no path forward. To ship this properly: (a) wait for Clerk to mark `reverification` GA OR pick an alternate fresh-auth strategy (e.g., a "type your password to confirm" Clerk component), (b) add the modal/inline UI in `ScreenSettings.tsx handleDelete` to trigger reverification before the DELETE call, (c) add `auth.has({ reverification: { level: 'first_factor', afterMinutes: 93 } })` to the route, fail-closed. Test: stolen-cookie request without recent fresh auth returns 403; legit flow with reverification completes.

### Other deferred items

- [ ] **Drizzle snapshot drift (chore).** `npx drizzle-kit generate` (no schema changes) produces a 35-line migration that drops + re-creates 11 FK constraints with old pre-rename names from migration 0013. Postgres `ALTER TABLE RENAME` does not rename associated FK constraint names — the snapshot at 0016 reflects the schema.ts (post-rename) names but prod still has the pre-rename constraint names. Any future migration generated by drizzle-kit will pull this drift in. Fix: dedicated chore PR that resyncs the snapshot OR runs the FK rename migration. Until done, hand-write any new migration SQL and skip the snapshot regeneration.

- [ ] **iOS push telemetry plan.** `docs/plans/push-notifications-meredith-iphone.md` Phase 0 was the originally-planned next session after the P1 batch. Do not start until the deferred B6-B8 push pipeline items above are shipped — the plan depends on the dedupe + deep-link + claimer-confirmation behavior being in place.

## Fixed

(none yet — this file is new in Session 4.)
