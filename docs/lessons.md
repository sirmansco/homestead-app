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

### 2026-05-02 · Mock `db.transaction` to delegate to the same shared `db` mock when testing services that mix direct + tx-scoped calls
**What happened:** B3 (PR #48) introduced `lib/users/tombstone.ts` — a service that wraps its work in `db.transaction(async tx => ...)`. The test harness for routes that call the service had previously stubbed `db.delete`/`db.update` directly. Post-B3 those stubs never fired because the service's writes happen via `tx.*`, not `db.*`. The fix: stub `db.transaction.mockImplementation(async cb => cb({ select: db.select, update: db.update, delete: db.delete, insert: db.insert, $count: db.$count }))` — pass back a `tx`-shaped object whose methods are the same shared `db` mock instances. After this, a single set of stubs covers both the service's tx-scoped writes and any direct `db.*` calls in the route, and assertions like `expect(db.delete).toHaveBeenCalled()` work transparently across both paths. Stage 2 review specifically pressure-tested whether the FK-race fallthrough test was real or dead code — it was real, but only because the `tx`-shaped object delegates to the same mock that throws.
**Why it matters:** Services that wrap work in a transaction expose a different identity (`tx`) inside than the `db` they're imported from. Naïvely mocking only `db.*` produces tests that pass because the service's tx-scoped writes go to an unmocked stub (returning `undefined`) — looking like success while exercising nothing. The pattern is generalizable: any service that uses `db.transaction` with tx-scoped writes needs its callers' tests to wire `db.transaction` to delegate back to the shared mock, or the test asserts the shape of calls that never happened.
**Next time:** When a service uses `db.transaction`, check the test harness for caller routes BEFORE migrating. Update the shared `db` mock to include `transaction: vi.fn()` (one-line addition), then in each test stub `vi.mocked(db.transaction).mockImplementation(async cb => cb(txShaped()))` where `txShaped()` returns `{ select: db.select, update: db.update, delete: db.delete, ... }`. Verify by running ONE test against a deliberately-wrong assertion to confirm the stubs actually fire.

### 2026-05-02 · Validate caller-supplied input *before* writing to external systems, not after
**What happened:** B2 (PR #45) closed synthesis L3 — `app/api/village/invite/route.ts` accepted `role` and `villageGroup` from the client and wrote them straight into Clerk `publicMetadata`, where `lib/auth/household.ts:43-58`'s first-user provisioning later reads them back into the DB. Even though Clerk's role enum was technically open-ended, the bleed-back path made the DB column effectively client-controlled. Fix was an explicit allowlist (`role ∈ {parent,caregiver}`, `villageGroup ∈ {covey,field}`) enforced *before* any `clerkClient()` call. Stage 2 review specifically pressure-tested control-flow ordering line-by-line because the validation being structurally present is not the same as it being unbypassable.
**Why it matters:** "Validate input" is necessary but not sufficient — *where* the validation runs in the control flow determines whether it actually closes the hole. A 400 emitted after a Clerk write doesn't undo the Clerk write; a 400 emitted after the rate-limiter doesn't reduce attack cost. The pattern generalizes: any boundary where caller input feeds an external mutation (Clerk, Stripe, Twilio, Vercel Blob, third-party webhook fan-out) needs the validate → external-write order asserted, not assumed.
**Next time:** When reviewing or writing a route that hands caller input to an external system, trace the control flow as an ordered list and name where each gate fires (auth, rate-limit, allowlist, external write). The allowlist must be strictly above the external write in that list. Add a `// allowlist runs before <system>` comment at the gate so future edits don't reorder it. Test it — assert the bad-input case never reaches the external mock (`expect(mockExternal).not.toHaveBeenCalled()`).
