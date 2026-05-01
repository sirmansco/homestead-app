---
tags: [homestead, covey, plan, rebrand, migration]
status: phase-5-pending — code complete, awaiting push verification + TM clearance for cutover
last-updated: 2026-05-01
owner: matt
canonical-execution-plan: docs/rebrand/rebrand-execution-plan.md
---

## What this is

A current-state reference for the Homestead → Covey platform migration. The detailed phase-by-phase execution plan lives at `docs/rebrand/rebrand-execution-plan.md`. This doc captures **where we are now**, what's done, what remains, and what the cutover trigger is.

---

## Current state (2026-05-01)

**Code: complete.** All rebrand code is on `main` behind the `COVEY_BRAND_ACTIVE=false` flag. The flag is the only thing separating production users from Covey branding.

**TM clearance: pending.** Phase 6 (cutover) is blocked until trademark opinion returns clean. Do not flip the flag before clearance.

---

## What's done (phases 0–4, all merged to main)

| Phase | What | Status |
|---|---|---|
| 0 | Branch + Neon snapshot + rollback doc + env flags scaffolded | ✅ merged to main |
| 1 | `lib/copy.ts` (semantic keys) + `lib/copy.covey.ts` + `lib/copy.homestead.ts` | ✅ merged to main |
| 1 | All customer-visible strings routed through `getCopy()` — notify, manifest, SW, iCal, legal, guide, layout metadata | ✅ merged to main |
| 1.5 | Staging-domain `noindex` meta wired in `app/layout.tsx` | ✅ merged to main |
| 2 | Visual rebrand — Covey brand kit, fonts, tokens, masthead, tab bar | ✅ merged to main |
| 3 | Component renames: `ScreenBell` → `ScreenLantern`, `ScreenVillage` → `ScreenCircle` | ✅ merged to main |
| 3 | `HomesteadApp` wired to `getCopy()` throughout | ✅ merged to main |
| 4a | DB enum extended: `covey` + `field` values added to `village_group` (migration 0004) | ✅ merged to main |
| 4b | Backfill migration: `inner_circle` → `covey`, `sitter` → `field` in existing rows (migration 0005) | ✅ merged to main |
| 4c | All code reads `covey`/`field`; old values still accepted defensively | ✅ merged to main |
| 4d | API route aliases not needed — routes already use brand-neutral paths | ✅ N/A |

**What the flag gates:** with `COVEY_BRAND_ACTIVE=true`, users see Covey branding — app name, icon, push copy, legal copy, guide copy, iCal export. With it false (current production), behavior is identical to pre-rebrand Homestead.

---

## What remains

### Phase 5 — Push notification verification (required before cutover)

Not yet done. Must run on a real device before Phase 6.

- [ ] Trigger a Lantern from dev/preview with `COVEY_BRAND_ACTIVE=true`. Confirm push title reads Covey copy.
- [ ] Trigger a Whistle. Confirm push title reads Covey copy.
- [ ] Trigger an escalation. Confirm escalation copy.
- [ ] Trigger a covered-Whistle response. Confirm response copy.
- [ ] Tap each notification — confirm deep link resolves to the right tab.
- [ ] Verify service worker fallback (break the push payload on purpose) shows Covey brand copy.
- [ ] iOS + Android, both.

**Blocker:** requires a preview deploy with `COVEY_BRAND_ACTIVE=true` in env and a real device with push permissions granted. Do this in a test household to avoid notifying real users.

### Phase 6 — Cutover (blocked on TM clearance)

**Trigger:** trademark opinion returns clean. Do not start until that opinion is in hand.

Ordered steps (each has a verification gate — stop if any gate fails):

1. **DNS prep (48h before)** — add `joincovey.co` + `thecovey.app` to Vercel, configure MX/SPF/DKIM/DMARC, verify with authoritative nameserver queries, send test email
2. **Clerk allowed origins** — add `joincovey.co` + `thecovey.app` to dev Clerk instance; keep existing origins
3. **Clerk email templates** — update app name + logo + copy in Clerk dashboard; send test email from each template
4. **Vercel env var flip** (the cutover moment) — set `COVEY_BRAND_ACTIVE=true` + update `NEXT_PUBLIC_APP_URL=https://joincovey.co` + update `NOTIFY_FROM` — all at once, then redeploy
5. **Smoke test production immediately** — `joincovey.co` serves app, Clerk sign-in shows "Covey", manifest returns Covey name/icons, push notification renders Covey copy, iOS PWA icon
6. **Domain primary swap** — set `joincovey.co` as primary in Vercel; old vercel.app URL redirects to it
7. **PWA cache invalidation** — bump SW version + manifest `id` field + redeploy; document iOS remove-and-readd for existing installs
8. **localStorage migration** — `homestead-theme` → `covey-theme` with dual-read for one release
9. **Email sender verification** — real magic-link sign-in from production, confirm SPF/DKIM pass
10. **Legal pages** — auto-update via flag (already in Phase 1 code)
11. **App Store / Play Store rebrand** — separate review process, do last

**Rollback:** set `COVEY_BRAND_ACTIVE=false` + revert env vars + redeploy. Full rollback procedure in `docs/plans/rebrand-rollback.md`.

### Phase 6.5 — Container renames (7+ days after stable cutover)

Wait period: at least 7 days after Phase 6 with no incidents. These are cosmetic/organizational.

1. Vault folder: `Apps/Homestead/` → `Apps/Covey/` (via `git mv`)
2. App folder: `homestead-app/` → `covey-app/` (via `git mv`)
3. GitHub repo: `sirmansco/homestead-app` → `sirmansco/covey` — **highest-risk step** (Vercel auto-deploy integration can silently lose connection; verify by pushing a trivial commit and watching Vercel)
4. Vercel project rename: `homestead-app` → `covey`
5. Archive old Homestead branding artifacts to `docs/archive/homestead-branding/`
6. Update vault MEMORY.md entries (4 Homestead entries → Covey entries)

### Phase 7 — Cleanup (4 weeks post-cutover, hard milestone)

Owner: Matt. Decision date: 4 weeks after Phase 6 completes.

- Drop old DB enum values (`inner_circle`, `sitter`) — only if zero production rows reference them
- Remove old API aliases (if any were added)
- Physical table renames (`bells` → `lanterns`, `shifts` → `whistles`) — only if there's product reason; internal names are not user-visible

---

## Key files

| File | Purpose |
|---|---|
| `lib/copy.ts` | Brand flag selector — reads `COVEY_BRAND_ACTIVE` |
| `lib/copy.covey.ts` | Covey copy (all semantic keys) |
| `lib/copy.homestead.ts` | Homestead copy (all semantic keys) |
| `docs/plans/rebrand-rollback.md` | Rollback procedures per phase + Neon snapshot ID |
| `docs/rebrand/rebrand-execution-plan.md` | Full phase-by-phase execution plan (canonical) |
| `.env.example` | `COVEY_BRAND_ACTIVE` and `NEXT_PUBLIC_COVEY_BRAND_ACTIVE` documented |
| `drizzle/0004_covey_enum_values.sql` | Added `covey`/`field` enum values |
| `drizzle/0005_enum_backfill.sql` | Backfilled old enum values to new ones |

---

## Environment variables

| Var | Scope | Current value | Cutover value |
|---|---|---|---|
| `COVEY_BRAND_ACTIVE` | Server (Production) | `false` | `true` |
| `NEXT_PUBLIC_APP_URL` | Production | `https://homestead-app-six.vercel.app` | `https://joincovey.co` |
| `NOTIFY_FROM` | Production | `Homestead <notify@homestead.app>` (or similar) | `Covey <notify@joincovey.co>` |

---

## Hard constraints (carry forward from execution plan)

- **TM clearance gates Phase 6.** No cutover without the opinion in hand.
- **Phase 5 push verification required before cutover.** Skip this and you risk wrong push copy hitting users at 2 a.m.
- **Verify DB migrations via `pg_enum` query, not `db:migrate` output.** Drizzle journal can record success for a failed migration. Always verify: `SELECT enumlabel FROM pg_enum JOIN pg_type ON pg_type.oid = pg_enum.enumtypid WHERE pg_type.typname = 'village_group';`
- **Do not remove old enum values yet.** Users invited before the backfill may still have old values in Clerk publicMetadata. Phase 7 cleanup handles removal after confirming zero production rows.
- **Multi-household Watcher model must not regress.** A Watcher can belong to N households. No uniqueness constraint on the caregiver→covey relationship.

---

## Risk register (top items)

| Risk | Severity | Status |
|---|---|---|
| Push notification wrong copy during cutover | HIGH | Mitigated by Phase 5 verification requirement |
| Drizzle journal trap (failed migration logs as success) | HIGH | Mitigated: verify via `pg_enum` query |
| GitHub → Vercel auto-deploy connection breaks on repo rename | HIGH | Verify on first push after rename; manual redeploy ready |
| iOS PWA cache pins old icon/manifest after cutover | MEDIUM | Mitigated: SW version bump + manifest `id` bump + user docs |
| Missed surface (something still says "Homestead" in production) | MEDIUM | Pre-cutover audit: `grep -ri 'homestead' app lib public` |
| Phase 7 cleanup never happens (old enum values fossilize) | MEDIUM | Hard milestone: 4 weeks post-cutover, owner Matt |
