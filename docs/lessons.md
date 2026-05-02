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

### 2026-05-02 · Validate caller-supplied input *before* writing to external systems, not after
**What happened:** B2 (PR #45) closed synthesis L3 — `app/api/village/invite/route.ts` accepted `role` and `villageGroup` from the client and wrote them straight into Clerk `publicMetadata`, where `lib/auth/household.ts:43-58`'s first-user provisioning later reads them back into the DB. Even though Clerk's role enum was technically open-ended, the bleed-back path made the DB column effectively client-controlled. Fix was an explicit allowlist (`role ∈ {parent,caregiver}`, `villageGroup ∈ {covey,field}`) enforced *before* any `clerkClient()` call. Stage 2 review specifically pressure-tested control-flow ordering line-by-line because the validation being structurally present is not the same as it being unbypassable.
**Why it matters:** "Validate input" is necessary but not sufficient — *where* the validation runs in the control flow determines whether it actually closes the hole. A 400 emitted after a Clerk write doesn't undo the Clerk write; a 400 emitted after the rate-limiter doesn't reduce attack cost. The pattern generalizes: any boundary where caller input feeds an external mutation (Clerk, Stripe, Twilio, Vercel Blob, third-party webhook fan-out) needs the validate → external-write order asserted, not assumed.
**Next time:** When reviewing or writing a route that hands caller input to an external system, trace the control flow as an ordered list and name where each gate fires (auth, rate-limit, allowlist, external write). The allowlist must be strictly above the external write in that list. Add a `// allowlist runs before <system>` comment at the gate so future edits don't reorder it. Test it — assert the bad-input case never reaches the external mock (`expect(mockExternal).not.toHaveBeenCalled()`).
