---
title: Circle / Invite / Role Audit + Fix Plan
created: 2026-05-06
status: ready-for-build
branch: fix/circle-invite-role-audit
scope-locked-by: matt (chat, 2026-05-06)
---

> Closes 6 of 10 `## Active` BUGS.md entries dated 2026-05-06 (vault path: `Apps/Covey/BUGS.md`). The remaining 4 are out of scope and will be logged for separate sessions.

## 1. Spec — what this should do

**Goal:** every Circle invite, role assignment, household routing decision, and profile-photo edit is governed by an explicit, server-enforced permission matrix. The spec amendment locking the matrix lands in this PR.

**Closes (in scope):**
1. **Settings invite role doesn't stick** — keeper picks `keeper`, invitee lands as `watcher`.
2. **Watchers see other watchers** in the Circle screen — privacy violation.
3. **Watcher-invited new family folds into watcher's household** — should create a new household with the invitee as `keeper` + `isAdmin`.
4. **Photo edit permissions unenforced** — any household member can overwrite any other adult's `photoUrl`.
5. **Watchers can pick role / villageGroup on invite** — should be forced to a fixed default; selectors hidden.
6. **Full Circle/invite/role audit** (the meta-bug) — closed by shipping this plan + tests + the matrix.

**Out of scope (logged for separate sessions, do not touch):**
- Sign-in screen dark mode unreadability
- Perch "Loading your schedule..." indefinite copy
- Perch header margin inconsistency
- Single-recipient Whistle post fails

### Success criteria (verifiable)

- Keeper invite via Settings: selected role is the role the new user lands with — verified by `tests/circle-invite-role-sticks.test.ts` AND a Vercel preview walkthrough.
- Watcher cannot send a payload that includes `appRole`/`villageGroup`; server rejects 403 — `tests/circle-watcher-cannot-set-role.test.ts`.
- Watcher invite to a new family produces a brand-new household with the invitee as `keeper`+`isAdmin=true`; the inviter is not added to that household — `tests/circle-watcher-invite-creates-new-household.test.ts`.
- A logged-in watcher GET `/api/circle` returns `keepers + chicks + self only`, no other watchers — `tests/circle-watcher-cannot-see-other-watchers.test.ts`.
- `/api/upload` rejects (403) any adult photo upload where `targetId !== caller.user.id`; permits keeper→chick uploads where `chick.householdId === caller.household.id`; permits watcher→self only — `tests/photo-edit-permissions.test.ts`.
- All 6 in-scope BUGS.md entries flip to `## Fixed` with date + `verified-by:` trailer (test name).

## 2. Permission matrix (locked)

### 2.1 Invite creation

| Inviter | Brand-new invitee | Existing Covey user | Selected role | Selected villageGroup | Mode |
|---|---|---|---|---|---|
| **keeper-admin** | ✅ allowed; can pick role + group | ✅ allowed | keeper or watcher | covey or field | email or link |
| **keeper-non-admin** | ❌ no Invite button | ❌ no Invite button | n/a | n/a | n/a |
| **watcher** | ✅ allowed only via "invite a new family" path; **role forced server-side**; selectors hidden | ❌ blocked (403) | forced `keeper` | n/a (`householdMode=create_new`) | email or link |

**Decision:** keeper-non-admin keeps today's behavior — admin-only on `/api/circle/invite`. Confirmed in chat (`b for now`).

### 2.2 Where invitees land

| Inviter | Invitee context | Resulting household |
|---|---|---|
| keeper-admin | brand-new | inviter's household; role per invite payload |
| keeper-admin | existing user | inviter's household (added as second `users` row per per-household-identity) |
| watcher | brand-new (only watcher-allowed path) | **NEW household** with invitee as `keeper`+`isAdmin=true`; inviter NOT added |

Implementation: `familyInvites` gains a `householdMode` enum: `join_existing` | `create_new`. Set at creation time based on inviter role; accept route branches on it.

### 2.3 Circle visibility

| Viewer | Sees keepers? | Sees chicks? | Sees watchers (covey)? | Sees watchers (field)? | Sees self? |
|---|---|---|---|---|---|
| keeper (any) | ✅ all | ✅ all | ✅ all | ✅ all | ✅ |
| watcher | ✅ all | ✅ all | ❌ filtered | ❌ filtered | ✅ (always) |

Filter at `/api/circle` GET when caller's role = watcher; UI follows server response (no client-side filter logic).

### 2.4 Profile photo edit

| Viewer role | Own photo | Other keeper | Chick (same household) | Watcher |
|---|---|---|---|---|
| keeper | ✅ | ❌ | ✅ | ❌ |
| watcher | ✅ | ❌ | ❌ | ❌ |

Server: `/api/upload` for `targetType=user` requires `targetId === caller.user.id`. For `targetType=kid` requires `caller.user.role === 'keeper' && chick.householdId === caller.household.id`. Reject 403 otherwise.
UI: `MemberCard` upload affordance hidden when `viewer.id !== target.id` (adults) or `viewer.role !== 'keeper'` (chicks).
Propagation: `photoUrl` is read-through `/api/photo/[id]`; no extra cache-busting needed. Regression test asserts a watcher's photo update is visible to the keeper on next load.

## 3. Conventions (pattern scan)

Confirmed by reading representative files in this codebase. New code matches; deviations called out below.

- **Error helper:** all `/api/circle/*` routes wrap their handler in `try { ... } catch (err) { return authError(err, '<tag>', '<fallback>'); }`. `authError` discriminates `not_signed_in` (401) / `no_access` (403) / `no_household` (409). Source: `lib/api-error.ts`. New routes match this exactly.
- **Rate limit:** `rateLimit({ key, limit, windowMs })` + `rateLimitResponse(rl)` early-return. Per-user keys use `${tag}:${userId}` shape. New routes inherit `invite-family:${user.id}` style.
- **Origin derivation:** `process.env.NEXT_PUBLIC_APP_URL || 'https://joincovey.co'` — never read from `Origin` header (C4 lesson).
- **Allowlist gating before persistence:** see `app/api/circle/invite/route.ts:9-46` (`ALLOWED_ROLES`, `ALLOWED_VILLAGE_GROUPS`). New `householdMode` validation follows the same pattern.
- **Migration style:** hand-written SQL in `drizzle/0018_*.sql`. Per project memory, do not regenerate snapshot — drift trap. Verify post-apply with `information_schema` against prod Neon, not the journal (project memory rule).
- **Tests:** Vitest, mock `@/lib/db`, `@/lib/auth/household`, `@/lib/ratelimit`, `@clerk/nextjs/server` at module scope; import route handlers directly. Reference: `tests/invite-family-correctness.test.ts`.

## 4. File map

### Schema + migration
- **NEW** `drizzle/0018_circle_invite_role_audit.sql` — adds `family_invites.app_role` (enum `app_role`, nullable), adds `family_invites.household_mode` (new enum `household_mode = 'join_existing' | 'create_new'`, NOT NULL DEFAULT `'join_existing'`). Backfill: existing pending rows get `'join_existing'` (existing watcher-initiated invites are zero in prod per BUGS.md context; this is the safe default).
- **EDIT** `lib/db/schema.ts` — add `householdModeEnum`, `appRole` and `householdMode` columns on `familyInvites`. Match column-name conventions.

### API
- **EDIT** `app/api/circle/invite-family/route.ts`
  - Read inviter's role from `requireHousehold()`.
  - For `keeper`: accept `appRole` and `villageGroup` from payload; allowlist-validate; persist on the invite row; `householdMode='join_existing'`.
  - For `watcher`: ignore payload `appRole`/`villageGroup`; force `appRole='keeper'`, `villageGroup` left null (irrelevant when `householdMode='create_new'`); `householdMode='create_new'`.
  - Reject 403 if inviter is `watcher` and tries to invite an existing user (matrix 2.1: watchers may only initiate "create_new" flows). Detection: if Clerk has a user with the target email already, deny.

- **EDIT** `app/api/circle/invite-family/accept/route.ts`
  - On accept, branch on `invite.householdMode`:
    - `join_existing`: today's path — set `acceptedHouseholdId = fromUser.householdId`, write `appRole`/`villageGroup` to Clerk publicMetadata so `requireHousehold()` first-user provisioning picks them up.
    - `create_new`: create a brand-new Clerk org for the invitee, set `acceptedHouseholdId = newHouseholdId`, write `appRole='keeper'`, `isAdmin=true` flag in publicMetadata. Do NOT add inviter to the new household.
  - Existing email-match guard (line 100) and atomic-consume guard (line 119) preserved unchanged.

- **EDIT** `app/api/circle/route.ts` GET (household scope)
  - When caller's `user.role === 'watcher'`, filter `adults` to `[keepers, ...chicks visible, self]`. Other watchers excluded from response payload — server-side filter, never client-only.
  - `scope=all` (multi-household caregiver view) is unaffected — that surface aggregates across households the watcher belongs to and shouldn't bleed peers either, but each household result is filtered identically.

- **EDIT** `lib/auth/household.ts`
  - When provisioning a new user from publicMetadata (line 44-72), accept `householdMode` from meta. If `'create_new'`, the path is unreachable here (Clerk org is brand-new, Clerk maps to the new household), but defend by asserting `meta.appRole === 'keeper'` and `isFirstUser === true` for the new org and surface a clear error if not.
  - No change to the choke-point `requireHousehold()` flow itself; this is read-through.

- **EDIT** `app/api/upload/route.ts`
  - Add server-side authorization per matrix 2.4:
    - `targetType === 'user'` AND `targetId !== user.id` → 403 `{ error: 'no_access' }` (don't update DB).
    - `targetType === 'kid'`: SELECT chick by `targetId`; if `chick.householdId !== household.id` → 403; if `user.role !== 'keeper'` → 403.
  - Existing `users.householdId === household.id` check remains as belt-and-suspenders.

### UI
- **EDIT** `app/components/ScreenCircle.tsx`
  - **InviteSheet (line 299–336):** when `caregiverMode` (watcher branch), hide the role and villageGroup selectors (currently rendered for both branches). Force payload to `{ parentName, parentEmail, mode }` — drop `villageGroup` from the watcher payload (server forces it). Default state setters at line 304–305 stay but unused in the rendered tree for caregiverMode.
  - **Caregiver Settings invite payload (line 316):** add `role` and `villageGroup` to the *keeper* `caregiverMode === false` branch — wait, re-read: line 316 is `caregiverMode === true`. Actually the bug here: when keeper opens the *invite-family*-style flow (the Settings caregiver-invite path), payload omits `role`. Fix: when `caregiverMode === true` AND viewer is keeper, send `{ parentName, parentEmail, villageGroup, mode, appRole: role }`. Server uses `appRole` to mirror the existing `/api/circle/invite` shape.
  - **Member list rendering (line 1011–1062, watcher visibility):** rendering already follows server payload — once `/api/circle` GET filters watchers out for watcher viewers, the list naturally hides them. No client-side filter needed; verify via test.
  - **MemberCard upload affordance (line 144):** add a `canEditPhoto: boolean` prop. Render the upload button only when truthy. Compute at the call sites:
    - For `parents.map(p => ...)` (line 975): `canEditPhoto = isMe`. (Keepers can edit own; can't edit other keepers.)
    - For `chicks.map(k => ...)` (line 994): `canEditPhoto = myRole === 'keeper'`.
    - For watcher list `members.map(m => ...)` (line 1036): `canEditPhoto = isMe`.

### Tests (TDD — write before each fix)

Each test must FAIL against current code and PASS after the fix it locks.

- **NEW** `tests/circle-invite-role-sticks.test.ts` — Bug #1. Keeper sends invite with `appRole='keeper'`; assert `familyInvites.appRole === 'keeper'`; on accept, assert `users.role === 'keeper'`.
- **NEW** `tests/circle-watcher-cannot-set-role.test.ts` — Bug #5. Watcher POSTs `/api/circle/invite-family` with `appRole='keeper'`, `villageGroup='covey'`; assert response either 403 or — if accepted — persisted invite has the watcher-forced values (`householdMode='create_new'`, `appRole='keeper'` ignoring payload).
- **NEW** `tests/circle-watcher-invite-creates-new-household.test.ts` — Bug #3. Watcher invite accepted by new user; assert a new Clerk org is created (mock the `clerk.organizations.createOrganization` call), assert `users.role='keeper'` AND `users.isAdmin=true` for the new user, assert the watcher (inviter) is NOT a member of the new household.
- **NEW** `tests/circle-watcher-cannot-see-other-watchers.test.ts` — Bug #2. GET `/api/circle` as a watcher in a household with two watchers; assert response `adults` excludes the peer watcher and includes self.
- **NEW** `tests/photo-edit-permissions.test.ts` — Bug #4. Six cells: keeper-self ✓, keeper-other-keeper ✗, keeper-chick ✓, watcher-self ✓, watcher-other-keeper ✗, watcher-other-watcher ✗. Plus one cross-household chick attempt → 403.
- **NEW** `tests/photo-update-visible-to-keepers.test.ts` — Bug #4 propagation. Watcher updates own photo; keeper GET `/api/circle` returns the new `photoUrl`. Belt-and-suspenders — read-through `/api/photo/[id]` should make this trivial; test exists to prevent caching regressions.
- **EXTEND** `tests/auth-error-shape.test.ts` — add cases for the new 403s (no_access on cross-user upload).

## 5. Anchors (do not break)

- `requireHousehold()` advisory-lock + first-user-isAdmin path (`lib/auth/household.ts:54-81`) — concurrent-call serialization is load-bearing for B2.
- `/api/circle/invite-family/accept` POST atomic-consume guard (`route.ts:112-120`) — `AND status != 'accepted'` is the race protection.
- `/api/upload` magic-byte sniff + EXIF strip (`route.ts:55-66`) — security controls; new auth checks land *before* these.
- Invite email-match guard (`accept/route.ts:99-102`) — `email_mismatch` 403 against token theft.
- C4 origin-from-env-only lesson — every new URL string uses `NEXT_PUBLIC_APP_URL`.
- Watcher caregiverVillage early return at `ScreenCircle.tsx:863` — watchers see a different component (`<CaregiverVillage>`); confirm that surface also reads from `/api/circle` so the server filter naturally applies.

## 6. Fragile areas

- **Drizzle journal vs. prod schema drift.** Project memory: `npm run db:migrate` output is not trustworthy. After applying 0018, verify against prod Neon `information_schema.columns WHERE table_name = 'family_invites'` AND `pg_enum WHERE enumtypid = 'household_mode'::regtype`. If mismatch, hand-apply.
- **Clerk org creation in `create_new` accept path.** Brand-new code. Failure modes: org create succeeds but DB insert fails → orphan org. Mitigation: wrap in try/finally that deletes the org on DB failure (rollback). Log every step. Test the rollback path explicitly.
- **`familyInvites.householdMode` backfill.** Existing pending invites are watcher-or-keeper-initiated under old semantics; defaulting to `join_existing` matches prior behavior. **Verify pending invite count before deploy** — if prod has a non-zero watcher-initiated pending invite, that user gets the wrong household routing. Mitigation: query `SELECT COUNT(*) FROM family_invites fi JOIN users u ON u.id=fi.from_user_id WHERE fi.status='pending' AND u.role='watcher'` pre-deploy; if >0, bulk-update those rows to `'create_new'` after the migration.
- **`ScreenCircle.tsx` is 1121 lines.** Edits should be scoped — InviteSheet, MemberCard, member list maps. Resist refactoring unrelated code.

## 7. Out of scope (do NOT touch this session)

Per Hard Rule #5 (no scope creep) and the audit prompt's explicit list:

- Sign-in screen dark mode (separate bug; log if discovered to be deeper)
- Perch "Loading your schedule..." copy
- Perch header margin inconsistency
- Single-recipient Whistle post failure
- Lantern silent-no-op UX (BUG-B follow-up)
- Anything in TODO.md not directly tied to the 6 in-scope bugs

If any of these get touched accidentally, scope-creep interrupt fires (Hard Rule, Phase 4): stop and propose plan update or split.

## 8. Spec amendment (lands in this PR)

Append to `Apps/Covey/docs/specs/covey.md` under `## Amendments`:

```
### 2026-05-06 — Circle / invite / role permissions

Locks the permission matrix governing invite creation, household routing, Circle
visibility, and profile-photo edits. Codifies four behaviors that were
under-specified and under-tested through v1.0 build:

1. Only household admins may invite into the household. Non-admin keepers see
   no Invite button. (Watchers have a separate path — see #2.)
2. Watchers may initiate invites only via the "invite a new family" flow,
   which creates a NEW household for the invitee with role=keeper, isAdmin=true.
   Watchers cannot pick role or villageGroup; both are forced server-side.
3. Watchers cannot see other watchers on the Circle screen. They see keepers,
   chicks, and themselves. Filter is server-side.
4. Profile photo edits: own photo only for adults; any chick in the household
   for keepers; never another adult's photo for any role. Both server (403) and
   UI (hidden affordance) enforce.

Rationale: 6 BUGS.md entries on 2026-05-06 traced to this surface area being
under-specified. Patching one at a time would whack-a-mole. The matrix locks
intent; tests in PR fix(circle): invite role + household authorization audit
lock the cells.
```

## 9. Build sequence (Phase 4)

After plan approval:

1. Branch `fix/circle-invite-role-audit` from `main`.
2. Reconcile BUGS.md split first (delete stale `covey-app/BUGS.md` or convert to redirect — per Matt's screenshot option #2). Single PR commit.
3. Schema migration (`drizzle/0018_*.sql` + schema.ts edit). Apply to a preview Neon branch first; verify with `information_schema`. Stop if drift.
4. Write `tests/circle-invite-role-sticks.test.ts`. Run; assert FAIL against current code. Then fix `/api/circle/invite-family` POST and `/api/circle/invite-family/accept` POST. Re-run; assert PASS.
5. Repeat 4 for each remaining test in dependency order: watcher-cannot-set-role → watcher-invite-creates-new-household → watcher-cannot-see-other-watchers → photo-edit-permissions → photo-update-visible-to-keepers.
6. UI edits last (ScreenCircle.tsx InviteSheet selector hiding, MemberCard `canEditPhoto`).
7. Spec amendment commit.
8. Open PR — `fix(circle): invite role + household authorization audit`.
9. Vercel preview walkthrough — keeper invite → keeper sticks; watcher invite → new household; watcher Circle screen lacks peers; photo upload affordance hidden on disallowed cards.

## 10. Graveyard

(Empty at start.)

## 11. Definition of done

- 6 in-scope BUGS.md entries flipped to `## Fixed` with date + `verified-by:` test name.
- All 7 new tests pass; existing tests still pass; CI green.
- Spec amendment committed.
- PR merged to main; Vercel preview demonstrated all matrix cells.
- 4 out-of-scope bugs logged unchanged in vault `BUGS.md ## Active` for separate sessions.
- Stale `covey-app/BUGS.md` removed/redirected per Matt's two-repos rule.
- Lessons appended to `REBUILD_LESSONS.md` if anything surprising surfaced.
- Project memory `project-covey.md` updated for the new schema + matrix.
