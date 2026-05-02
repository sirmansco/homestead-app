---
title: Launch audit — security-ops
date: 2026-05-02
domain: security-ops
auditor: codex (file written by orchestrator after sandbox write rejection — all evidence re-verified by orchestrator's own Read tool calls before writing)
---

## Summary

Combined security + ops sweep. Verified `app/api/upload/route.ts`, `lib/strip-exif.ts`, `app/api/feedback/route.ts`, `vercel.json`, `.env.example`, `app/api/shifts/ical/route.ts`, `app/context/AppDataContext.tsx`, `package.json`. Three blocks-launch findings (upload bypass, public deterministic blob keys, feedback POST unbounded) and four should-fix (cron not wired in `vercel.json` — overlap with N3, Sentry env vars missing from `.env.example`, AppDataContext silent fetch swallow — overlap with P5, no `engines` pin and migration-then-build ordering risk in `vercel.json`). No `dangerouslySetInnerHTML` use found in scanned components, so no XSS finding.

## Findings

### Finding 1 — Upload route validates by extension only; non-JPEG bypasses EXIF strip
- **Severity:** blocks-launch
- **Root cause (falsifiable):** `app/api/upload/route.ts:40-44` derives `ext` from `file.name.split('.').pop()` and validates against `['jpg','jpeg','png','webp','gif']` with no magic-byte content-type verification, then passes the client-supplied `file.type` straight to `@vercel/blob` `put` (line 57). `lib/strip-exif.ts:21` returns the input unchanged for any non-JPEG (PNG/GIF/WebP), so a malicious PNG with embedded payload, or any non-image renamed to `.jpg`, is stored verbatim with the attacker's Content-Type header.
- **Evidence:** `app/api/upload/route.ts:40` `const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';`; `app/api/upload/route.ts:57` `put(pathname, cleanBuf, { access: 'public', addRandomSuffix: false, contentType: file.type })`; `lib/strip-exif.ts:21` `if (!isJpeg) return input;`.
- **Why it matters at 5K:** Security bar requires "EXIF strip + content-type validation + size cap on every blob upload." Extension-only validation fails the content-type half. Combined with public blob keys (Finding 2), this means attacker-controlled files in attacker-chosen MIME types served from the same origin/bucket. Even without active payload execution, GPS-laden PNGs of children pass through unscrubbed — the privacy invariant the EXIF stripper was written to enforce.
- **Proposed fix (root cause):** Verify magic bytes against the claimed extension via a small sniffer (first 8 bytes for JPEG/PNG/GIF/WebP signatures); reject mismatches with 400. Extend `stripExif` to handle PNG `tEXt`/`iTXt`/`eXIf` chunks and WebP EXIF chunks, or vendor a maintained library. Compute the stored Content-Type from the verified signature, not `file.type`.
- **Regression test:** `tests/upload-magic-byte-validation.test.ts` — POST a `.jpg` whose bytes are PNG signature, assert 400; POST a PNG with synthetic GPS metadata in a `tEXt` chunk, fetch the stored URL, assert metadata is gone.
- **Effort:** M
- **Cross-references:** Finding 2 (deterministic public keys compound the impact); spec NN around photo storage.

### Finding 2 — Blob storage keys are public and deterministic, embedding household + entity IDs
- **Severity:** blocks-launch
- **Root cause (falsifiable):** `app/api/upload/route.ts:53` constructs `pathname = \`homestead/${household.id}/${targetType}-${targetId}.${ext}\`` and `app/api/upload/route.ts:57` calls `put` with `access: 'public', addRandomSuffix: false`. Anyone who knows or guesses (`householdId`, `userId | kidId`, ext) can fetch the asset directly without any auth check, bypassing household membership entirely.
- **Evidence:** `app/api/upload/route.ts:53,57` (cited above).
- **Why it matters at 5K:** Spec confidentiality of child photos is the highest-trust surface in the app. Deterministic keys + UUID enumeration + public access = a script can probe URLs and exfiltrate any kid photo whose IDs leak (and household IDs ship in client responses across multiple routes). This violates the security bar: "Authorization — every write route checks household membership; row-level access enforced server-side." Reads of the actual stored asset bypass the row-level gate entirely.
- **Proposed fix (root cause):** Either (a) flip blob `access` to a private mode and serve photos through an authenticated `/api/photo/[id]` proxy that checks `requireHousehold()` + ownership before streaming bytes, or (b) keep public access but use `addRandomSuffix: true` and persist the returned signed URL on the row, gating reads behind a route that resolves the row first. (a) is more defensible.
- **Regression test:** `tests/upload-blob-access.test.ts` — upload a kid photo as household A, then attempt to fetch the deterministic URL pattern unauthenticated; assert the URL pattern is not predictable from public IDs (or asserts 401 on the proxy route in design (a)).
- **Effort:** M
- **Cross-references:** Spec privacy guarantees for kid photos; D1 (auth surface generally).

### Finding 3 — `/api/feedback` POST has no body-size cap and no rate limit
- **Severity:** blocks-launch
- **Root cause (falsifiable):** `app/api/feedback/route.ts:14` calls `await req.json() as { message?: string; kind?: string }` with no `Content-Length` guard, no `req.text()`-then-parse-with-cap, and no `rateLimit({ key: 'feedback:...' })` import or call anywhere in the file. `message?.trim()` is then inserted verbatim into the `feedback` table (line 23-30).
- **Evidence:** `app/api/feedback/route.ts:14` `const body = await req.json() as ...`; full file (37 lines) shows zero rate-limit imports.
- **Why it matters at 5K:** Reliability bar (5xx < 0.1%) and cost: a single attacker streaming arbitrarily large JSON bodies into `req.json()` blocks one serverless function per request and consumes DB write quota. Even one motivated abuser at 5K saturation can degrade tail latency for the cohort sharing concurrency. Same defect surfaced in Domain 4 as AP3; this finding adds the security framing — DoS and DB-cost exfiltration vector — and overlaps cleanly. Single fix.
- **Proposed fix (root cause):** Read body as text with explicit Content-Length check (reject > 16KB with 413), then `JSON.parse`. Add `rateLimit({ key: \`feedback:${user.id}\`, limit: 5, windowMs: 60_000 })` before the parse. Cap `message.length` to 4000 chars before insert.
- **Regression test:** `tests/feedback-body-cap.test.ts` — POST with Content-Length 200KB body, assert 413; POST 6 times within a minute as same user, assert the 6th returns 429.
- **Effort:** S
- **Cross-references:** AP3 (Domain 4) — dedup target for the fix, shared regression test acceptable.

### Finding 4 — `vercel.json` lacks `crons` and `functions` configuration; bell-cron route is dead in prod
- **Severity:** should-fix
- **Root cause (falsifiable):** `vercel.json` contents in full: `{ "buildCommand": "npm run db:migrate && next build" }`. No `crons: [...]` array exists, so the route file at `app/api/bell/cron/route.ts` is never invoked by Vercel's scheduler. No `functions: { ... }` block, so all routes inherit defaults (no per-route `maxDuration` for the bell-cron path, no memory pinning).
- **Evidence:** `vercel.json` (full file, 3 lines).
- **Why it matters at 5K:** Spec promises 5-minute escalation from `inner_circle` to `sitter` if no response. Without the cron firing, escalation never happens — caregivers in the field tier are never paged when the inner circle goes silent. This is the same defect as N3 in Domain 3; the security/ops framing here is "ops readiness bar: build is reproducible and observable from config." The misconfig is invisible until a real lantern fails to escalate. Marked should-fix not blocks-launch because Domain 3 already classifies the operational impact as blocks-launch — this is the config-half of the fix and shares severity in synthesis.
- **Proposed fix (root cause):** Add to `vercel.json`: `"crons": [{ "path": "/api/bell/cron", "schedule": "* * * * *" }]` and `"functions": { "app/api/bell/cron/route.ts": { "maxDuration": 30 } }`. Document the schedule rationale in a top-of-file comment in the route handler.
- **Regression test:** `tests/vercel-config.test.ts` — load `vercel.json`, assert `crons` array contains an entry whose `path === '/api/bell/cron'` and schedule is parseable. CI-only; a dead-config test that would have caught the omission.
- **Effort:** S
- **Cross-references:** N3 (Domain 3) — same root cause, both findings collapse to one fix in the synthesis pass.

### Finding 5 — Sentry env vars used in `sentry.*.config.ts` are absent from `.env.example`
- **Severity:** should-fix
- **Root cause (falsifiable):** `.env.example` has no `SENTRY_*` or `NEXT_PUBLIC_SENTRY_*` entries (verified by `grep -i sentry .env.example` returning no matches). `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts` all exist (`ls sentry*.config.ts`), so production reads vars that contributors setting up locally have no template for.
- **Evidence:** `.env.example` (no Sentry section); presence of the three Sentry config files in repo root.
- **Why it matters at 5K:** Operational readiness bar: "Sentry captures unhandled errors with source maps." A new deployment that forgets the DSN ships silent observability. Not load-breaking, but every silent-failure finding in this audit assumes Sentry is wired — if it isn't, all the other "we'd see this in Sentry" claims become vacuous.
- **Proposed fix (root cause):** Add to `.env.example`: `SENTRY_DSN=""`, `SENTRY_ORG=""`, `SENTRY_PROJECT=""`, `SENTRY_AUTH_TOKEN=""` (with comments explaining which are build-time vs. runtime). Add a startup log line in `sentry.server.config.ts` if DSN is missing.
- **Regression test:** `tests/sentry-env-documented.test.ts` — parse `.env.example`, parse `sentry.*.config.ts`, assert every `process.env.SENTRY_*` referenced in the configs exists as a key in `.env.example`.
- **Effort:** S
- **Cross-references:** None.

### Finding 6 — `AppDataContext` swallows fetch errors with bare `catch {}` blocks
- **Severity:** should-fix
- **Root cause (falsifiable):** `app/context/AppDataContext.tsx` has bare `catch {}` blocks at lines 98 (fetchBell), 134 (fetchShifts), and 165 (fetchVillage). The errors never reach Sentry's automatic global handler (this is a synchronous awaited fetch inside a try/catch, so the rejection is consumed inside the function and never propagates to `window.onerror` / `unhandledrejection`).
- **Evidence:** `app/context/AppDataContext.tsx:98` `} catch {`; same pattern at :134 and :165; no `Sentry.captureException` or `console.error` inside any of the three blocks.
- **Why it matters at 5K:** Reliability bar requires `< 0.5% silent-failure rate` and "every async side-effect emits a log line." The three polling fetches are the client's only signal that the server is healthy. Silent swallow means: a degraded `/api/bell/active` returning 5xx to 100% of clients during a partial outage produces zero observability events. Same defect surfaced in Domain 6 as P5 with a perf-monitoring framing; this one is the ops-observability framing. Single fix.
- **Proposed fix (root cause):** In each catch, call `Sentry.captureException(err)` and emit a `console.warn` with a stable tag (`[appdata:bell]`, etc.). Do not swallow.
- **Regression test:** `tests/app-data-context-errors.test.ts` — mock `fetch` to reject, mount `AppDataProvider`, assert `Sentry.captureException` was called with the rejection.
- **Effort:** S
- **Cross-references:** P5 (Domain 6) — same root cause; one fix.

### Finding 7 — `package.json` lacks `engines` pin and `vercel.json` runs migrations before build
- **Severity:** should-fix
- **Root cause (falsifiable):** `grep -A2 '"engines"' package.json` returned no output — there is no `engines` field. `vercel.json` `buildCommand` is `"npm run db:migrate && next build"`, which runs migrations against the production database before the build's own type-check passes. A build that fails after migrations have already mutated prod schema leaves the deployed code on the prior SHA but the database on the new schema — an inverted partial-deploy.
- **Evidence:** `package.json` (no `engines` block); `vercel.json` `buildCommand` (full content cited in Finding 4 evidence).
- **Why it matters at 5K:** Operational readiness bar: "Build is reproducible (no Turbopack APFS-cache surprises in CI)." Without `engines`, Node version drifts silently between contributor laptops and Vercel; reproducibility breaks. The migrate-then-build ordering is the more material risk: any failed type-check post-migration leaves prod with new schema and old code, which the soft-delete and FK-restrict findings (D1, D2) make a non-theoretical hazard.
- **Proposed fix (root cause):** Add `"engines": { "node": "22.x", "npm": "10.x" }` (or whatever Vercel currently provisions) to `package.json`. Change `buildCommand` to `"next build"` and migrate from a separate Vercel deploy hook (or a release-phase script that runs only after build success and before traffic shift). The exact mechanism is operational; the principle is "never mutate prod schema before code that depends on it has been proven buildable."
- **Regression test:** `tests/build-ordering-config.test.ts` — assert `vercel.json` `buildCommand` does not contain `db:migrate` (i.e., migration is not part of the in-line build command); assert `package.json` has `engines.node` set.
- **Effort:** M (because the migration mechanism itself has to move, not just the config string).
- **Cross-references:** D1, D2 (data integrity findings make this hazard concrete).

## Out-of-domain observations

- The ICS route at `app/api/shifts/ical/route.ts:64` does a dynamic `import('@clerk/nextjs/server')` inside the request path. This is the dynamic-import-in-hot-path pattern Domain 6 flagged generally; the ICS route is not hot, so this is observation-only. Cold start of `ical` adds ~50–150ms on a cache miss, which is acceptable for a calendar-app polling once a minute.
- ICS has two auth paths: `?token=` (calToken in DB) and Clerk session. The token path at `app/api/shifts/ical/route.ts:58` selects on `users.calToken` — verify the column has a unique index and that token rotation on user-deletion is wired (handoff to D1/D2 for full check).
- No `dangerouslySetInnerHTML` use found in scanned components — XSS surface is genuinely absent at the tier I checked. Synthesis can route this back to D7 if any later spot check finds one.

## What I did not check

- `app/api/shifts/ical/route.ts` token entropy and rotation on member deletion (overlap with D1/D2; needs a fuller pass than budget allowed).
- `next.config.ts` Sentry source-map upload config — read but not deeply audited for source-map leakage to public.
- Full sweep of every screen component for `dangerouslySetInnerHTML` — sampled, did not exhaust.
- `package.json` script audit beyond `engines` (lifecycle hooks, postinstall security).
