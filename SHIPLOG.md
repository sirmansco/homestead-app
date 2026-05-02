---
title: Homestead — SHIPLOG
purpose: Per-merge ship entries (Protos v9.7 §"Review and ship"). Append-only.
---

## Format

```
### YYYY-MM-DD · <PR #> · <one-line title>
**Branch:** <branch> → main (<merge sha>)
**Plan:** <path/to/plan.md>
**What shipped:** (1-2 sentences, bar-tied)
**Verification:** (test path / preview URL / verified-by trailer)
**Follow-ups:** (none, or batch-id of next dependent work)
```

---

### 2026-05-02 · #50 · B-snapshots — Reconstruct missing drizzle snapshots + ship pending `village_group` default ALTER
**Branch:** `fix/migrations-snapshot-repair` → main (`b3fee55`)
**Plan:** [docs/plans/migrations-snapshot-repair.md](docs/plans/migrations-snapshot-repair.md)
**What shipped:** Closes the snapshot-drift half of synthesis L11 + ships a genuinely-missing default migration. Snapshot files for `0001`, `0004`, `0005` were never committed; every `db:generate` since `0004` had been silently bundling those migrations' enum/default ALTERs into the next .sql output, which would have failed the next deploy at `ALTER TYPE ADD VALUE 'covey'` (no `IF NOT EXISTS`, value already in prod). Reconstructed three snapshots from each migration's SQL, repointed `0002.prevId` from `0000.id` to `0001.id` (kit rejects DAGs — empirically discovered during build, original plan hypothesis was wrong), and shipped `0006_village_group_default.sql` with the two `SET DEFAULT 'covey'` ALTERs that have been pending since the rebrand (`0005` only UPDATE'd rows; the column-default rename was committed to schema.ts but never migrated). Doctor extended with check #8 (warn-mode): every `<tag>.sql` has a matching `meta/<idx>_snapshot.json`. Discovered mid-B4 build phase; B4 now unblocked — next `db:generate` produces a clean single-line `0007_<random>.sql` for the bells index.
**Verification:** [tests/migrations-snapshot.test.ts](tests/migrations-snapshot.test.ts) — 6 cases (snapshot existence, prevId chain resolution, no-DAG, post-state spot-checks for 0001/0004/0006). Stage 1 spec-reviewer (fresh context) PASS. Stage 2 code-reviewer (fresh context) PASS-WITH-NOTES (two plan-doc defects: stale DAG-tolerance hypothesis, wrong doctor draft code); both addressed in fixup commit `780d40d` before merge. Falsifiable proof: `npm run db:generate` reports "No schema changes, nothing to migrate". Full suite: 20 files / 175/175 tests pass (was 169 — +6 new). `npm run db:doctor` clean. CI: Vercel deploy passed twice (initial + fixup).
**Follow-ups:** Promote doctor check #8 from warn → error in a follow-up batch (~3-line edit; intentional gradual-rollout per plan §"Pressure-test §3"). Resume B4 (cron escalation) on rebased branch — index migration regenerates clean atop main. Synthesis L11's raw-script audit (`scripts/migrate-*.ts`) remains a separate batch.

### 2026-05-02 · #43 · B1 — `requireHouseholdAdmin()` + admin authority migration
**Branch:** `fix/launch-b1-admin-authority` → main (`062a245`)
**Plan:** [docs/plans/launch-audit-fix-batch-01-admin-authority.md](docs/plans/launch-audit-fix-batch-01-admin-authority.md)
**What shipped:** Closes synthesis L4. Single `requireHouseholdAdmin()` helper now gates household profile PATCH, member PATCH/DELETE, and admin transfer; `user.role !== 'parent'` ad-hoc checks deleted; divergent free-text errors collapsed to canonical `{ error: 'no_access' }` 403. `NotAdminError` lives in `lib/api-error.ts` (re-exported from `lib/auth/household.ts`) so `authError()`'s `instanceof` check stays resolvable across the test surface.
**Verification:** [tests/auth-access-household-admin.test.ts](tests/auth-access-household-admin.test.ts) — 19 cases. Gate-logic block exercises the real `requireHouseholdAdmin` against stubbed `auth()` + `db.select` (`vi.importActual`). Route matrix asserts admin → 200, parent-without-isAdmin → 403 `no_access`, unauthenticated → 401 `not_signed_in`, non-member → 409 `no_household` for each migrated route. CI: Vercel deploy passed.
**Follow-ups:** B2 (village CRUD admin gate L2 + village invite role allowlist L3 + notification preferences identity scoping L5) — unblocked.

### 2026-05-02 · #48 · B3 — Member tombstone service + admin Clerk-membership drop parity
**Branch:** `fix/launch-b3-member-tombstone` → main (`e2588ea`)
**Plan:** [docs/plans/launch-audit-fix-batch-03-soft-delete-fk.md](docs/plans/launch-audit-fix-batch-03-soft-delete-fk.md)
**What shipped:** Closes synthesis L9 + L2's delete-safety half + B2 SHIPLOG follow-up. New `lib/users/tombstone.ts` is the canonical per-household user-removal path: detects authored history on the two `ON DELETE restrict` FKs (`shifts.createdByUserId`, `bells.createdByUserId`) and either hard-deletes (zero history) or anonymizes in place using the canonical `[deleted]` placeholder pattern from `account/route.ts` (per spec NN #16b). Wraps in `db.transaction` with FK-race fall-through to anonymize. Pre-cleanup matches `account/route.ts` parity: nulls `claimedByUserId`, cancels future-authored shifts, and on the anonymize branch deletes `pushSubscriptions`, `caregiverUnavailability`, and pending `familyInvites` (Stage 2 review note — closed). Three caller routes migrated: `village/leave`, `village/route.ts` DELETE-adult, `household/members/[id]` DELETE. Admin village-DELETE-adult now drops Clerk org membership in parity with `members/[id]` (B2 SHIPLOG follow-up — closed); both admin routes surface `clerkDropped: boolean` in the response and structured log so Clerk-side failures aren't invisible (`account/route.ts:148-156` parity, Stage 2 review note — closed). Bare `catch {}` on the existing `members/[id]` Clerk drop replaced with `console.error` (Hard Rule #3). `account/route.ts:127` migration to the service deferred (Pressure-test §5 in plan — multi-household loop + own Clerk-user-deletion conflicts with service's per-household scoping).
**Verification:** [tests/user-tombstone.test.ts](tests/user-tombstone.test.ts) — 13 cases (5 service unit including FK-race fallthrough, 8 route integration covering all three callers + Clerk-drop success/failure + anonymize-branch). Stage 1 spec-reviewer (fresh context) graded against spec NN #16b/#3 and the data-integrity bar — PASS. Stage 2 code-reviewer (fresh context) pressure-tested Principle 6 ordering, postgres-js error surface for the FK-race catch (verified live, not dead code), unique-constraint freed by anonymize's `clerkUserId` rewrite — PASS-WITH-NOTES; all 3 notes closed in fixup commit (`2bcb277`) before merge. Full suite: 19 files / 169 tests pass. Grep gate: `(db|tx)\.delete\(users\)` returns only `lib/users/tombstone.ts:58` (hard-delete branch) and `account/route.ts:127` (deferred). CI: Vercel deploy passed twice (initial + fixup).
**Follow-ups:** Account-route migration to the service (deferred, low-risk). Anonymized rows still surface in `village.GET` adult lists as `[deleted]` — UX cleanup, defer to a UI batch. Theme A continuation L1 (`/api/village/invite-family/accept` anonymous GET-mutation) is independent and unblocked.

### 2026-05-02 · #45 · B2 — Village authz + invite role allowlist + notification per-household scoping
**Branch:** `fix/launch-b2-village-authz` → main (`130c83b`)
**Plan:** [docs/plans/launch-audit-fix-batch-02-village-authz.md](docs/plans/launch-audit-fix-batch-02-village-authz.md)
**What shipped:** Closes synthesis L2, L3, L5. Village POST/DELETE migrated to `requireHouseholdAdmin()`. Caregiver self-removal split out to `POST /api/village/leave` (non-admin, scoped to `(user.id, household.id)`) — gives L9 a clean home for the tombstone service. Invite POST gated by admin AND validates `role ∈ {parent,caregiver}` / `villageGroup ∈ {covey,field}` against an explicit allowlist *before* any Clerk metadata write, closing the bleed-back path through `requireHousehold()`'s first-user provisioning. Notifications GET/PATCH bind to active household only — multi-household users no longer have prefs silently flipped across siblings.
**Verification:** [tests/auth-access-village-authz.test.ts](tests/auth-access-village-authz.test.ts) — 18 cases. Stage 2 code-review (fresh context) pressure-tested allowlist enforcement order, notifications WHERE narrowing, ScreenCircle UI swap, and admin-gate completeness via `grep -rn "isAdmin|requireHousehold|user.role" app/api/`; all passed with file:line evidence. Companion PR #46 repointed two stale `ScreenVillage.tsx` parser tests to `ScreenCircle.tsx`, restoring full suite to 18/18 files / 156/156 tests. CI: Vercel deploy passed.
**Follow-ups:** B3 (L9 member tombstone service in `lib/services/`, called from village/leave + village DELETE + members/[id] DELETE) — unblocked. Latent observation surfaced during Stage 2: admin village-DELETE (`app/api/village/route.ts:98`) hard-deletes the DB row but never drops the Clerk org membership, while the parallel `members/[id]/route.ts:50-60` does. Worth folding into B3's scope.
