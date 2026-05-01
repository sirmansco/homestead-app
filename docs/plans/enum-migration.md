# Plan — DB Enum Migration: inner_circle→covey, sitter→field

## Spec
Rename the two live `village_group` enum values used throughout the codebase from `inner_circle`/`sitter` to `covey`/`field`. The new values already exist in the Postgres enum (migration 0004 added them). This PR: (1) writes the backfill migration, (2) updates every code reference to use the new values, and (3) drops the old values from the schema definition.

Done = `grep -r inner_circle --include="*.ts" --include="*.tsx"` returns zero hits outside ScreenBell.tsx (legacy file, deletion tracked separately), `ScreenVillage.tsx` (legacy, same), and `copy.homestead.ts` (Homestead copy file, not used in Covey mode). All tests pass.

## File map
- `drizzle/0005_enum_backfill.sql` — new: UPDATE backfill + DROP old values
- `lib/db/schema.ts` — update column defaults from `inner_circle` → `covey` (enum definition unchanged — old values stay valid)
- `lib/notify.ts` — query filters: `inner_circle`→`covey`, `sitter`→`field`
- `lib/auth/household.ts` — type union + default assignment
- `app/api/bell/[id]/respond/route.ts` — query filters + auto-create default
- `app/api/household/members/[id]/route.ts` — type union + validation guard
- `app/api/village/route.ts` — default assignment
- `app/api/village/invite/route.ts` — type union
- `app/api/village/invite-family/route.ts` — type union + default
- `app/api/shifts/[id]/claim/route.ts` — auto-create default
- `app/components/ScreenCircle.tsx` — type alias + literals
- `app/components/ScreenLantern.tsx` — type alias
- `app/accept-family-invite/page.tsx` — type union + GROUP_LABEL key
- `tests/admin-transfer.test.ts` — fixture data
- `tests/household.test.ts` — fixture data
- `tests/village-post.test.ts` — fixture data

**Not in scope (legacy files, tracked for deletion separately):**
- `app/components/ScreenBell.tsx` — legacy, not rendered
- `app/components/ScreenVillage.tsx` — legacy, not rendered
- `lib/copy.homestead.ts` — Homestead-mode copy, not active in Covey

## Graveyard
(empty at start)

## Anchors
- Postgres enum already has `covey`/`field` live (migration 0004)
- `lib/bell-escalation.ts` has no direct enum references — no change needed
- `scripts/doctor.ts` already lists all four values — no change needed
- `lib/copy.covey.ts` uses display strings, not DB values — no change needed

## Fragile areas
- Do NOT drop old enum values (`inner_circle`/`sitter`) from the Postgres enum. Clerk publicMetadata for invited users stores the old string values; dropping them would break user auto-create on first sign-in for anyone invited before this change. Old values stay in the schema enum; the code just stops writing them. Enum value removal is a Phase 5 post-launch cleanup after confirming zero rows reference them.
- `lib/auth/household.ts` reads `villageGroup` from Clerk publicMetadata. Type unions must include `'covey' | 'field'` going forward but the Postgres enum still accepts old values defensively.
