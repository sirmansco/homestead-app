# Phase 6 Cutover + Cleanup — Session 7

## Scope gate
**Goal:** finish the last two code items of Phase 6 and remove three dead artifacts, all in one PR.  
**Done when:** SW cache version is covey-v2, localStorage key is covey-theme in both layout.tsx and ScreenSettings.tsx, brand-probe route is deleted, unused covey-icon-* files are deleted, birthday bug moved to Fixed in BUGS.md.  
**Out of scope:** Clerk email templates (Matt's task), Vercel Pro upgrade, DNS/email setup, push verification (item 7 is a separate session).

## Conventions (pattern scan)
- `app/api/sw-script/route.ts` — CACHE_VERSION is a module-level const driven by env var; no side-effects on import
- `app/layout.tsx` — localStorage key is in an inline dangerouslySetInnerHTML script, not a shared util
- `app/components/ScreenSettings.tsx` — theme key used in three places (read, remove, set) via bare `localStorage` calls
- Two separate repos: app code → `sirmansco/homestead-app`, vault docs → `mjsirmans/The-Vault`

## File map
1. `app/api/sw-script/route.ts` — bump CACHE_VERSION from `covey-v1` to `covey-v2`
2. `app/layout.tsx` — replace `homestead-theme` with `covey-theme` in the blocking script
3. `app/components/ScreenSettings.tsx` — replace all three `homestead-theme` occurrences with `covey-theme`
4. `app/api/brand-probe/route.ts` — delete entire file + directory
5. `public/icons/covey-icon-*.png` — delete 4 files (covey-icon-192, covey-icon-512, covey-icon-192-maskable, covey-icon-512-maskable)
6. `Apps/Homestead/BUGS.md` (vault repo) — move birthday bug to ## Fixed with evidence

## Graveyard
_(empty at start)_

## Anchors
- SW auto-update mechanism (DEPLOY_SHA comment change) must remain intact
- `covey-v1` references in the existing deployed SW must be handled by `covey-v2` activation cleaning up — no asset caching, so no old-cache eviction needed
- ScreenSettings theme toggle must still function after key rename
- All other PWA icons (apple-touch-icon, icon-192 quail, icon-512 quail, maskable variants) must remain

## Fragile areas
- The covey-icon-* files being deleted: verify no reference in manifest.json or any code before deleting
- `homestead-theme` key: any user with the old key stored will lose their theme preference on first load after deploy — acceptable for this stage, not worth a migration shim
