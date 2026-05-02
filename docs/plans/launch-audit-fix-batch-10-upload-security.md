---
title: Launch fix batch 10 — Upload security (privacy-critical)
date: 2026-05-02
status: shipped
governs: L27
parent-audit: docs/plans/launch-audit-2026-05-02/synthesis.md
batch-id: B10
prereqs: none (independent)
unblocks: launch (L27 is blocks-launch — launch cannot flip until B10 ships)
decision-locked: 2026-05-02 — option (a) private blob + authenticated /api/photo/[id] proxy
---

## Spec

After this batch, `/api/upload` (a) verifies file content against claimed extension via magic-byte sniffing, (b) strips metadata from JPEG/PNG/WebP/GIF (extending `lib/strip-exif.ts`), (c) stores files behind authenticated access. Specifically:

1. **Content-type verification** — Read the first 12 bytes of the file. Compare against known magic-byte signatures: JPEG `FF D8 FF`, PNG `89 50 4E 47 0D 0A 1A 0A`, GIF `47 49 46 38 (37|39) 61`, WebP `52 49 46 46 ?? ?? ?? ?? 57 45 42 50`. Reject mismatches with 400 `bad_content_type`. Compute the stored `contentType` from the verified bytes, NOT from `file.type`.

2. **EXIF strip extension** — `lib/strip-exif.ts` extended to handle:
   - PNG: remove `tEXt`, `iTXt`, `zTXt`, `eXIf` chunks. Preserve image data (`IHDR`, `IDAT`, `IEND`, `PLTE`, `tRNS`, color management).
   - WebP: remove `EXIF` and `XMP ` RIFF chunks. Preserve `VP8`, `VP8L`, `VP8X`, `ICCP`, `ALPH`, `ANIM`, `ANMF`.
   - GIF: GIF metadata is generally minimal; safe to keep as pass-through but document why.

3. **Authenticated access — DECIDED 2026-05-02: option (a).** Flip blob `access` to private. Add `/api/photo/[id]/route.ts` GET that resolves the row, calls `requireHousehold()`, verifies ownership, then streams blob bytes via Vercel Blob's read API. Response sets `Cache-Control: private, max-age=3600` so per-session browser caching mitigates the extra request hop. Rationale: Covey stores child photos; option (b)'s random-suffix URLs are unrevocable bearer tokens (screenshot, browser-history sync, log paste = permanent leak), and the UI sweep cost for (a) is hours, not days, given Covey's component count. Option (b) is rejected.

**Done criteria:** Magic-byte mismatch returns 400. PNG with synthetic GPS in `tEXt` chunk arrives stored without metadata. Direct GET of a deterministic blob URL pattern (the old contract) does not return kid photos. Regression test exists.

**Out of scope:** Re-uploading existing photos to strip metadata retroactively (operational backfill, separate plan); migrating away from `@vercel/blob` (not justified by this audit).

## Conventions

Pattern scan (`app/api/upload/route.ts`, `lib/strip-exif.ts`):
- `lib/strip-exif.ts` is hand-rolled, no external deps; the JPEG path is well-commented. Extension should match the same minimal-allocation style.
- Vercel Blob `put` accepts `{ access, addRandomSuffix, contentType }`. Authenticated reads in option (a) use `head(url)` and a `fetch(url)` proxy stream — verify against `node_modules/@vercel/blob/dist/docs/` if uncertain.
- `requireHousehold()` already gates ownership in upload POST; the GET proxy in option (a) reuses the same helper.

## File map

- `lib/upload/sniff.ts` — new file. `verifyImageMagicBytes(buffer, ext): { ok: true, mime } | { ok: false, reason }`.
- `lib/strip-exif.ts` — extend for PNG, WebP, GIF.
- `app/api/upload/route.ts:40-44, 53, 57` — call `verifyImageMagicBytes`; use verified MIME for `contentType`; set blob `access: 'private'`, drop `addRandomSuffix: false` constraint (irrelevant under private access).
- `app/api/photo/[id]/route.ts` — new GET. Reads `kids` or `users` row by id, gates on `requireHousehold()` + ownership match, streams blob bytes via `@vercel/blob` read API. Sets `Cache-Control: private, max-age=3600`.
- UI sweep: every `<img src={...photoUrl}>` becomes `<img src={\`/api/photo/${id}\`}>`. Starting grep: `grep -rn "photoUrl" app/components/`. Likely surfaces: `ScreenVillage`, `ScreenSettings`, `ScreenBell`, `ScreenPost` per `homestead-app/CLAUDE.md` "Where things live."
- `tests/upload-magic-byte-validation.test.ts` — regression for the content-type half of L27.
- `tests/upload-blob-access.test.ts` — regression for the access half of L27.
- `tests/strip-exif-png.test.ts`, `tests/strip-exif-webp.test.ts` — regressions for the metadata-stripping additions.

## Graveyard

- Considered `access: 'private'` with `addRandomSuffix: true` (option b) on 2026-05-02 — rejected. Random-suffix URLs are irrevocable bearer tokens (screenshot/log/browser-history sync = permanent leak). Authenticated proxy is the only rightly-revocable path for child photos.
- Considered placing `NotAdminError`-style logic in `lib/auth/household.ts` — rejected on 2026-05-02 after lessons from B1: `instanceof`-checked error classes belong in the module that discriminates, not the one that throws.

## Anchors

- `lib/strip-exif.ts:21` JPEG handling — preserved. Extension added non-JPEG paths below.
- `app/api/upload/route.ts` rate limit — preserved.
- `requireHousehold()` ownership check on POST — preserved.
- All 359 tests green pre/post change. 43 new tests added covering magic-byte sniffer, PNG/WebP strip, and photo proxy auth.

## Fragile areas

- WebP RIFF parsing has subtle chunk-alignment rules; vendor a maintained library if the hand-rolled path becomes complex (`@vercel/blob`'s docs may suggest one). Decide before code.
- UI sweep is required (decision: option a). Every photo render path must change to `/api/photo/[id]`. Use `grep -rn "photoUrl\|blob.vercel-storage.com\|/homestead/" app/ | grep -v ".test."` as a starting point. Verify in a browser smoke test that village/settings/bell/post screens all render photos correctly post-change.
- Magic-byte sniff for animated WebP differs from still WebP; cover both in the test.

## Regression tests required (Hard Rule #6)

Listed in the file map. Crucial tests:
- POST with `.jpg` filename but PNG-signature body → 400.
- POST PNG with synthetic GPS in `tEXt` chunk → stored, fetched, metadata absent.
- Unauthenticated GET against `/api/photo/{kidId}` → 401.
- GET against `/api/photo/{kidId}` of household A authenticated as user from household B → 403.
- Authenticated GET as household A member → 200 with image bytes and `Cache-Control: private, max-age=3600`.
