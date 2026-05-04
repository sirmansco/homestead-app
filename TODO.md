---
title: Covey — TODO / Deferred Work
purpose: Backlog of items deferred from prior sessions. Per Protos v9.7 §"Standard project file paths".
---

## Active

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
