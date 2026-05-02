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

### 2026-05-02 · #43 · B1 — `requireHouseholdAdmin()` + admin authority migration
**Branch:** `fix/launch-b1-admin-authority` → main (`062a245`)
**Plan:** [docs/plans/launch-audit-fix-batch-01-admin-authority.md](docs/plans/launch-audit-fix-batch-01-admin-authority.md)
**What shipped:** Closes synthesis L4. Single `requireHouseholdAdmin()` helper now gates household profile PATCH, member PATCH/DELETE, and admin transfer; `user.role !== 'parent'` ad-hoc checks deleted; divergent free-text errors collapsed to canonical `{ error: 'no_access' }` 403. `NotAdminError` lives in `lib/api-error.ts` (re-exported from `lib/auth/household.ts`) so `authError()`'s `instanceof` check stays resolvable across the test surface.
**Verification:** [tests/auth-access-household-admin.test.ts](tests/auth-access-household-admin.test.ts) — 19 cases. Gate-logic block exercises the real `requireHouseholdAdmin` against stubbed `auth()` + `db.select` (`vi.importActual`). Route matrix asserts admin → 200, parent-without-isAdmin → 403 `no_access`, unauthenticated → 401 `not_signed_in`, non-member → 409 `no_household` for each migrated route. CI: Vercel deploy passed.
**Follow-ups:** B2 (village CRUD admin gate L2 + village invite role allowlist L3 + notification preferences identity scoping L5) — unblocked.

### 2026-05-02 · #45 · B2 — Village authz + invite role allowlist + notification per-household scoping
**Branch:** `fix/launch-b2-village-authz` → main (`130c83b`)
**Plan:** [docs/plans/launch-audit-fix-batch-02-village-authz.md](docs/plans/launch-audit-fix-batch-02-village-authz.md)
**What shipped:** Closes synthesis L2, L3, L5. Village POST/DELETE migrated to `requireHouseholdAdmin()`. Caregiver self-removal split out to `POST /api/village/leave` (non-admin, scoped to `(user.id, household.id)`) — gives L9 a clean home for the tombstone service. Invite POST gated by admin AND validates `role ∈ {parent,caregiver}` / `villageGroup ∈ {covey,field}` against an explicit allowlist *before* any Clerk metadata write, closing the bleed-back path through `requireHousehold()`'s first-user provisioning. Notifications GET/PATCH bind to active household only — multi-household users no longer have prefs silently flipped across siblings.
**Verification:** [tests/auth-access-village-authz.test.ts](tests/auth-access-village-authz.test.ts) — 18 cases. Stage 2 code-review (fresh context) pressure-tested allowlist enforcement order, notifications WHERE narrowing, ScreenCircle UI swap, and admin-gate completeness via `grep -rn "isAdmin|requireHousehold|user.role" app/api/`; all passed with file:line evidence. Companion PR #46 repointed two stale `ScreenVillage.tsx` parser tests to `ScreenCircle.tsx`, restoring full suite to 18/18 files / 156/156 tests. CI: Vercel deploy passed.
**Follow-ups:** B3 (L9 member tombstone service in `lib/services/`, called from village/leave + village DELETE + members/[id] DELETE) — unblocked. Latent observation surfaced during Stage 2: admin village-DELETE (`app/api/village/route.ts:98`) hard-deletes the DB row but never drops the Clerk org membership, while the parallel `members/[id]/route.ts:50-60` does. Worth folding into B3's scope.
