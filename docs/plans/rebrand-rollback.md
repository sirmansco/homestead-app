---
created: 2026-04-30
branch: rebrand/covey
purpose: rollback procedures for the Homestead → Covey rebrand
---

## Safety net

**Neon database backup branch:** `pre-rebrand-2026-04-30` (created 2026-04-30 via Vercel Storage → Neon).
- Production DB host: `ep-holy-paper-amovep2g-pooler.c-5.us-east-1.aws.neon.tech`
- Backup branch will auto-delete? **No** — manual delete only (do not delete until rebrand stable for 4+ weeks)

## Branch model

- `main` = production Homestead (untouched until merge approved)
- `rebrand/covey` = the rebrand work; flag-gated so flag-off behavior is byte-identical to `main`

## Env flags

| Flag | Default | Set true to activate Covey branding |
|---|---|---|
| `COVEY_BRAND_ACTIVE` | `false` | Server-side: notification copy, iCal export, email FROM |
| `NEXT_PUBLIC_COVEY_BRAND_ACTIVE` | `false` | Client-side: PWA manifest name + icons, in-app brand strings |

Both must be true for full Covey. Either one alone leaves a partial-rebrand state — only used in dev/preview while testing.

## Rollback procedures

### If Phase 0/1 cause a problem (no migrations run yet)
1. `git switch main`
2. Production is untouched — no action needed
3. Branch `rebrand/covey` retains the work; debug at leisure

### If Phase 4 migration causes a problem (DB schema changed)
1. **DB recovery:** Vercel Dashboard → Storage → Neon → Branches → switch production to `pre-rebrand-2026-04-30` (or restore from it)
2. **Code recovery:** revert the Phase 4 commit on `rebrand/covey`, OR `git switch main` if rebrand isn't merged yet
3. **Verify:** `SELECT enumlabel FROM pg_enum JOIN pg_type ON pg_type.oid = pg_enum.enumtypid WHERE pg_type.typname = 'village_group';` should show only `inner_circle, sitter`
4. Redeploy

### If Phase 6 cutover causes a problem (env vars flipped)
1. Vercel Dashboard → Project Settings → Environment Variables
2. Set `COVEY_BRAND_ACTIVE=false` and `NEXT_PUBLIC_COVEY_BRAND_ACTIVE=false` in Production scope
3. Revert `NEXT_PUBLIC_APP_URL` and `NOTIFY_FROM` to old values (Homestead Vercel URL + `hello@sirmans.co`)
4. Trigger redeploy
5. **Caveats:** sent emails are gone, PWA cache is stuck on whatever was active at install (users may need to remove + re-add icon), DNS-level changes are irreversible without DNS changes

### If GitHub/Vercel/Clerk renames cause a problem (Phase 6.5)
- GitHub: rename repo back via dashboard. Auto-redirect from new name handles old links for several months.
- Vercel: project rename is reversible via dashboard. Domain attachments preserved.
- Clerk: app rename is reversible via dashboard. Allowed origins are additive — old origins still work if not removed.

## Per-phase commit boundaries

Filled in as work lands:

- Phase 0 complete: SHA `caa8479` (2026-04-30)
- Phase 1 complete: SHA `7737e2d` (2026-04-30)
- Phase 2 complete: SHA `___`
- Phase 3 complete: SHA `948d4f5` (2026-04-30)
- Phase 4 complete: SHA `a9a14ce` (2026-04-30)
- Phase 5 complete: SHA `___`

## Rollback decision owner

**Matt Sirmans.** Final call on rollback at any phase. AI agents can recommend but not execute Phase 6 cutover or Phase 6.5 dashboard changes without explicit approval.

## TM clearance note

This rebrand is proceeding *before* attorney TM clearance returns. The Covey Inc. (Reg. 6964738, IC 042 HR/recruiting AI) yellow flag remains. If clearance returns blocked or contested, fallback is full Homestead restore via env flag flip + DB branch restore + GitHub revert.
