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
