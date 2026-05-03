---
title: fix/covey-rebrand-internal — Internal identifier rename (Homestead → Covey)
date: 2026-05-02
status: active
batch-id: B12
governs: cosmetic / non-launch-blocking
parent-audit: docs/plans/launch-audit-2026-05-02/synthesis.md (post-sprint cleanup)
prereqs: all L1–L30 shipped (confirmed 2026-05-02)
---

## Scope gate

**Goal:** eliminate every internal use of "Homestead" from code identifiers — file names, function/component names, variables, test descriptions, and blob path prefixes. The `COVEY_BRAND_ACTIVE` flag and `lib/copy.homestead.ts` are intentionally retained (the flag mechanism is the live kill-switch; the legacy copy file is paired with it).

**Success criteria (falsifiable):** `grep -rn "Homestead\|homestead" --include="*.ts" --include="*.tsx" app/ lib/ tests/` returns only:
1. The `homestead-theme` localStorage compat shim (one line; must stay for existing users who have the old key stored)
2. `lib/copy.homestead.ts` and its direct consumers (`lib/copy.ts` import + `tests/copy.test.ts`) — these are flag-mechanism files, not identifiers
3. Reference comments in docs (non-executable, not in scope)

**Out of scope:**
- `docs/`, `SHIPLOG.md`, `BUGS.md`, `lessons.md`, plan files — historical record, leave as-is
- `lib/copy.homestead.ts` file name and its `homesteadCopy` export — tied to the flag kill-switch
- `app/api/notifications/route.ts:18` comment referencing `docs/specs/homestead.md` — doc path reference, not an identifier
- Drizzle migration files (schema history, immutable)
- `package.json` `"name": "homestead-app"` — used as the npm package name only; cosmetic, defer to a follow-up if desired

## Conventions (pattern scan)

- **Component rename:** `HomesteadApp` → `CoveyApp`, `HomesteadInner` → `CoveyInner`. One file rename: `HomesteadApp.tsx` → `CoveyApp.tsx`. Import in `app/page.tsx` updates accordingly.
- **Blob path prefix:** `homestead/${household.id}/...` → `covey/${household.id}/...` in `app/api/upload/route.ts`. Existing blobs in Vercel Blob storage at the `homestead/` prefix are not affected by a code change — they remain accessible by their stored URL. Only new uploads go to `covey/`. No migration needed (URLs are stored on the row; old rows keep old URLs).
- **Tombstone email domain:** `deleted+${id}@homestead.app` → `deleted+${id}@covey.app` in `lib/users/tombstone.ts` and `app/api/account/route.ts`. These are placeholder emails on anonymized rows; no email is ever sent to them.
- **Rate-limiter comment:** `lib/ratelimit.ts:6` — update the doc comment only.
- **localStorage compat shim:** `app/layout.tsx:63` and `app/components/ScreenSettings.tsx:29` read `homestead-theme` as a fallback for users who stored the old key. **Keep this read.** Rename the write key if one exists (check first). Do not break existing user theme preferences.
- **Invite placeholder email:** `app/api/village/invite/route.ts:59` `invite+...@homestead.local` → `invite+...@covey.local`.
- **`tabbar-safe-area.test.ts`:** `HOMESTEAD_APP` constant references the file path — update the constant name and path after the file rename.

## File map

| File | Change |
|---|---|
| `app/components/HomesteadApp.tsx` → `app/components/CoveyApp.tsx` | Rename file; rename `HomesteadApp` → `CoveyApp`, `HomesteadInner` → `CoveyInner` |
| `app/page.tsx` | Update import path and component name |
| `app/api/upload/route.ts` | `homestead/${...}` → `covey/${...}` (blob path prefix) |
| `app/api/village/invite/route.ts` | `@homestead.local` → `@covey.local` |
| `app/api/village/invite-family/route.ts` | Comment: "join Homestead" → "join Covey" |
| `app/api/account/route.ts` | `deleted+${row.id}@homestead.app` → `@covey.app` |
| `lib/users/tombstone.ts` | `deleted+${userId}@homestead.app` → `@covey.app` |
| `lib/ratelimit.ts` | Update doc comment |
| `app/components/ScreenAlmanac.tsx` | Comment cleanup only |
| `tests/tabbar-safe-area.test.ts` | `HOMESTEAD_APP` → `COVEY_APP`; update file path constant |
| `tests/upload-blob-access.test.ts` | Update mock blob URL prefixes `homestead/` → `covey/` |
| `tests/upload-magic-byte-validation.test.ts` | Update mock blob URL prefix |

**Files intentionally unchanged:**
- `lib/copy.homestead.ts`, `lib/copy.ts`, `tests/copy.test.ts` — flag-mechanism files
- `app/layout.tsx:63`, `app/components/ScreenSettings.tsx:29` — compat shim reads (keep)
- `app/api/notifications/route.ts:18` — doc path comment

## Graveyard

(empty — session start)

## Anchors

- `homestead-theme` localStorage fallback read in `app/layout.tsx` and `ScreenSettings.tsx` — must not be removed (existing users)
- 423/423 tests green on main — full suite must stay green after rename
- `lib/copy.homestead.ts` export name and file name — do not rename (flag kill-switch)

## Fragile areas

**§1 — File rename breaks any import that uses the old path.** `app/page.tsx` is the only importer of `HomesteadApp.tsx` (confirmed by grep). After rename, verify `grep -rn "HomesteadApp" --include="*.ts" --include="*.tsx" app/ lib/ tests/` returns zero matches outside the renamed file itself.

**§2 — Blob path prefix change is forward-only.** Old blobs at `homestead/` are stored by URL on their DB rows and remain valid. New uploads go to `covey/`. No migration. Tests that mock the old URL prefix must be updated to match the new prefix so they don't drift from the real route behavior.

**§3 — localStorage compat shim.** `app/layout.tsx` reads both `covey-theme` and `homestead-theme`; writes presumably use `covey-theme` (check before touching). `ScreenSettings.tsx:29` reads the same pair. Do not remove the `homestead-theme` read — it's the compat path for any user who stored the old key before the rebrand shipped.
