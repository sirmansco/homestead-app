---
title: Homestead — Lessons
purpose: Project-local lesson log (Protos v9.7 §"Capture"). Append-only. Cross-project lessons live in /Volumes/X9 Pro/The Vault/Apps/BUILD-LESSONS.md.
---

## Format

```
### YYYY-MM-DD · One-line title
**What happened:** (1-2 sentences, specific)
**Why it matters:** (the general principle)
**Next time:** (action, not advice)
```

---

### 2026-05-02 · Define `instanceof`-checked error classes in modules that aren't routinely mocked
**What happened:** B1 (PR #43) introduced `NotAdminError`, used by `authError()` (in `lib/api-error.ts`) via `instanceof`. The plan placed the class in `lib/auth/household.ts` alongside the new `requireHouseholdAdmin()` helper. During build, defining it there would have broken the `instanceof` check in any test that mocks `@/lib/auth/household` without `vi.importActual` — the spread mock would shadow the class as `undefined`, and a thrown error would silently fall through to the 500 fallback. Decision: define `NotAdminError` in `lib/api-error.ts` (the module that owns the discrimination) and re-export from `lib/auth/household.ts` for ergonomics.
**Why it matters:** `instanceof` checks need a stable identity across the import graph. Test mocks routinely replace whole modules; any module that's commonly mocked is a poor home for an exception class that's checked elsewhere via `instanceof`. The class belongs with the discriminator, not with the thrower.
**Next time:** When introducing a typed error checked via `instanceof`, place it in the module that does the discrimination (the `catch`/`authError`/`apiError` path), not the module that throws it. Re-export from the throwing module for ergonomics. Validate by listing every test that mocks the throwing module — if any of them spread without `importActual`, the location is wrong.
