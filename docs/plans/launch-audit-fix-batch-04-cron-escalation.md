---
title: Launch fix batch 04 — Cron wiring + bounded escalation
date: 2026-05-02
status: pending
governs: L14 (primary), L15 (paired)
parent-audit: docs/plans/launch-audit-2026-05-02/synthesis.md
batch-id: B4
prereqs: Vercel project on Pro tier (Hobby caps crons at once-daily — see Pressure-test §1)
unblocks: none direct; clears synthesis Theme F. Theme G (push correctness) is independent.
---

## Spec

This batch closes synthesis Theme F: the spec contract at `docs/specs/homestead.md:82` ("If no positive response within 5 minutes → escalate to sitter tier") is currently un-shipped because no cron is wired to invoke `/api/bell/cron`. The route exists, is correctly authed (Bearer `CRON_SECRET`), and its underlying worker `lib/bell-escalation.ts` is atomic against double-escalation — but `vercel.json` has no `crons` array, so escalation never fires in production. This is a blocks-launch defect against the reliability bar (`launch-readiness-5k.md` §"Reliability bar").

**L14 (blocks-launch).** Wire the cron in `vercel.json`. After this lands, the inner_circle → sitter 5-minute escalation contract becomes operational.

**L15 (should-fix, paired).** The current cron handler `SELECT`s every due bell with no `LIMIT` and runs `escalateBell` over the entire result set via `Promise.allSettled`. After L14 fix, the very first cron tick post-deploy hits a backlog of bells whose 5-minute mark passed during the un-shipped window — at 5K saturation the math is bounded but not small, and the unindexed scan plus unbounded fan-out can blow function timeout in one tick. Fix: bounded `LIMIT` per tick, supporting index `(status, escalated_at, created_at)` matching the WHERE, capped concurrency on the per-bell worker fan-out. Synthesis sequences these as F: "L14 first, L15 immediately after to avoid backlog blast." This batch ships them in **one PR** because L14 alone ships a known footgun — the backlog blast on first deploy is the exact failure mode L15 prevents, and shipping L14 without L15 means inviting one bad cron tick before the safety bound lands.

**Done criteria:**
- `vercel.json` contains `"crons": [{ "path": "/api/bell/cron", "schedule": "*/1 * * * *" }]` and `"functions": { "app/api/bell/cron/route.ts": { "maxDuration": 60 } }`. The existing `buildCommand` is preserved verbatim.
- `app/api/bell/cron/route.ts` adds `LIMIT 50` to the due-bell select and applies a per-batch concurrency cap of 10 on the per-bell `escalateBell` calls. Structured log line emitted with `processed`, `failed`, `eligible_total` (count of due bells found before LIMIT) so backlog drain is observable across ticks.
- `lib/db/schema.ts` `bells` table gains `index('idx_bells_status_escalated_created').on(t.status, t.escalatedAt, t.createdAt)` in the table-options callback.
- New Drizzle migration `drizzle/0006_bells_escalation_index.sql` (and matching `_journal.json` entry) created via `drizzle-kit generate`. The journal `when` is strictly greater than `0005_enum_backfill`'s — verified by `npm run db:doctor` post-generate.
- New `tests/bell-cron.test.ts` covers (a) auth: missing/wrong Bearer → 401; (b) bounded batch: ≥51 due bells → only 50 processed in one tick, structured log surfaces `eligible_total ≥ 51`; (c) concurrency cap honored: per-batch in-flight count never exceeds 10 (asserted via spy on `escalateBell` mock); (d) per-bell failure does not poison batch: one bell's `escalateBell` rejects, others still complete and `failed: 1` reported.
- `npm run test` passes the new file plus the full existing suite. `npm run lint` clean. `db:doctor` clean against the new migration.

**Out of scope:**
- L12 (doctor coverage gap on `pushSubscriptions` and constraints). The new `bells` index doesn't add a column or break existing column expectations; doctor's `EXPECTED_COLUMNS` for `bells` already covers `escalated_at` (`scripts/doctor.ts:48`). Adding constraint-shape verification is a separate batch (Theme K).
- L16 (notification observability — silent no-op early returns in `lib/notify.ts`). The cron's per-bell catch already logs (`lib/bell-escalation.ts:25-27`); structured logging on the cron-level outcome is added here, but the `notify.ts` internal early-return logging stays for the L16 batch.
- L20 / L21 / L22 (other indexing work). The synthesis Theme H bundles all index migrations but Theme F is a coherent unit on its own and shipping the bell-escalation index alone keeps the diff falsifiable per-batch. The other indexes can land in a single later migration without conflict.
- Vercel Pro tier procurement / billing change. Surfaced as a hard prereq (Pressure-test §1) — user owns it before this batch merges.
- L13 (server-side push outcome surfacing). The cron's logged `processed`/`failed` count is the cron-level summary; per-bell push delivery telemetry from `lib/notify.ts` returning structured outcomes is L13's job.

## Conventions

Pattern scan of B4 surface (`app/api/bell/cron/route.ts`, `lib/bell-escalation.ts`, `lib/notify.ts`, `lib/push.ts`, `lib/db/schema.ts`, `drizzle/`, `vercel.json`, `tests/bell-active.test.ts`, `tests/user-tombstone.test.ts`):

- **`vercel.json` is one line today** — `{ "buildCommand": "npm run db:migrate && next build" }`. Adding `crons` and `functions` keys preserves it verbatim. Synthesis L30 flags `buildCommand` running migrations before build as a should-fix (inverted-partial-deploy risk) but that's a separate batch and out of scope here. **B4 does not modify `buildCommand`.**
- **Drizzle index migrations:** every prior schema change in this codebase used `drizzle-kit generate` (B2 PR #45's `0004_covey_enum_values.sql` + `0005_enum_backfill.sql`). The pattern: edit `lib/db/schema.ts`, run `npm run db:generate`, commit both the new `.sql` and the updated `meta/_journal.json`. Doctor (`scripts/doctor.ts:80-86`) enforces strict monotonic `when` ordering — generate handles this correctly when run from a clean main, but verify post-generate.
- **Drizzle table-options callback shape:** `users` table at `lib/db/schema.ts:38-40` shows the canonical pattern: `(t) => ({ name: unique(...).on(...) })`. The same callback supports `index(...)`. The `bells` table currently has no callback — add one with the index entry. Drizzle ORM 0.45 supports `index()` from `drizzle-orm/pg-core`; verify the import in the schema diff before committing.
- **Cron route auth:** `app/api/bell/cron/route.ts:8-11` already does Bearer-token auth correctly. Returns `{ error: 'Unauthorized' }` (free-text key per L8). B4 does NOT migrate this to typed `unauthorized()` helpers — that's L8's batch. Keep the existing string.
- **Concurrency limiter location:** there is no `p-limit` dependency, no `lib/concurrency.ts`, and no precedent for any concurrency limiter in this codebase. `Promise.all`/`Promise.allSettled` are the only fan-out patterns, and `lib/push.ts:66-87` does in-flight fan-out without bounding. Adding `p-limit` (1.5KB, runtime dep) vs hand-rolling — see Pressure-test §5. **Decision: hand-rolled inline helper inside the cron route.** No new dependency, no new lib file. ~12-line function.
- **Structured cron logging:** `lib/push.ts:99-108` is the canonical structured log shape — `console.log(JSON.stringify({ event: '<name>', context: '<context>', ...counters }))`. B4 cron emits `event: 'bell_cron'` matching this shape.
- **Test mocking pattern:** `tests/user-tombstone.test.ts:1-30` is the most recent template — `vi.mock('@/lib/db', () => ({ db: { select: vi.fn(), update: vi.fn(), delete: vi.fn(), insert: vi.fn(), $count: vi.fn(), transaction: vi.fn() } }))`. The cron route uses `db.select` only, so the mock can be lighter, but follow the same shape for grep-discoverability. **Important:** `lib/bell-escalation.ts` is the unit under co-test — the cron test mocks `escalateBell` (not `db.update` inside it) so the bound is asserted at the cron layer, not duplicated.
- **`escalateBell` worker boundary:** the cron route imports `escalateBell` from `lib/bell-escalation.ts` (line 5). The cron's responsibility is "find the due batch, bound it, fan it out with concurrency cap, log the outcome." `escalateBell`'s responsibility is "atomically claim and notify a single bell." Keep that separation — do NOT inline the per-bell logic into the cron route, and do NOT add batch-level state into `escalateBell`. (See Pressure-test §3 for the SQL `UPDATE ... RETURNING` alternative considered and rejected.)
- **Drizzle `LIMIT` placement:** `lib/notify.ts` and `app/api/bell/active/route.ts` use `.limit(N)` on chained query builders. Apply that pattern verbatim to the cron's `db.select().from(bells).where(...)` chain.

## File map

- **`vercel.json` — edit (~3-line addition).** Add `crons` array and `functions` object as siblings to existing `buildCommand`. Final shape:
  ```json
  {
    "buildCommand": "npm run db:migrate && next build",
    "crons": [
      { "path": "/api/bell/cron", "schedule": "*/1 * * * *" }
    ],
    "functions": {
      "app/api/bell/cron/route.ts": { "maxDuration": 60 }
    }
  }
  ```
  Schedule: `*/1 * * * *` (every minute). Justified in Pressure-test §2.

- **`lib/db/schema.ts` — edit (`bells` table, ~3-line addition).** Add table-options callback with the composite index. Import `index` from `drizzle-orm/pg-core` if not already imported (it currently isn't — only `unique` is used at `users:39`).
  ```ts
  export const bells = pgTable('bells', {
    // ... existing columns unchanged ...
  }, (t) => ({
    statusEscalatedCreatedIdx: index('idx_bells_status_escalated_created').on(t.status, t.escalatedAt, t.createdAt),
  }));
  ```
  Index column order matches the WHERE clause column order at `app/api/bell/cron/route.ts:15-19` — `status` (high-selectivity equality on `'ringing'`), then `escalated_at IS NULL`, then `created_at <=` range. Postgres can use the index for the `IS NULL` predicate via the `b-tree`'s natural NULL handling on the composite key.

- **`drizzle/0006_bells_escalation_index.sql` — new file (generated).** Run `npm run db:generate` after the schema edit. Expected output: a single `CREATE INDEX "idx_bells_status_escalated_created" ON "bells" ("status","escalated_at","created_at");` statement. The corresponding `meta/_journal.json` entry is auto-appended; verify monotonic `when` greater than `0005_enum_backfill`'s. **Do not hand-edit the .sql** — `db:doctor` hashes the file and any drift between hash and journal entry fails the check.

- **`app/api/bell/cron/route.ts` — edit (~30-line restructure).** The diff:
  1. Add `LIMIT 50` to the `db.select` chain.
  2. Capture `due.length` before fan-out for the structured log.
  3. Replace `Promise.allSettled(due.map(...))` with a bounded fan-out using a hand-rolled concurrency limiter (cap 10).
  4. Replace the existing `console.error` failure log with a structured `console.log({ event: 'bell_cron', processed, failed, eligible_total, batch_size })` line covering both success and failure cases — caller (Vercel logs scrape) sees one line per tick regardless of outcome. The old failure-only `console.error` stays as a separate line for rejection details.
  5. Response body adds `eligible_total` so an external watcher can detect backlog drain progress across ticks.

  Concurrency limiter shape (inline helper, ~12 lines):
  ```ts
  async function runWithConcurrency<T, R>(
    items: T[],
    limit: number,
    worker: (item: T) => Promise<R>,
  ): Promise<PromiseSettledResult<R>[]> {
    const results: PromiseSettledResult<R>[] = new Array(items.length);
    let cursor = 0;
    async function next() {
      while (cursor < items.length) {
        const idx = cursor++;
        try {
          results[idx] = { status: 'fulfilled', value: await worker(items[idx]) };
        } catch (reason) {
          results[idx] = { status: 'rejected', reason };
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => next()));
    return results;
  }
  ```
  Justified in Pressure-test §5. The shape mirrors `Promise.allSettled` so the existing `failed.filter(r => r.status === 'rejected')` line stays unchanged.

- **`tests/bell-cron.test.ts` — new file (~150 lines).** Five describe blocks:
  1. **Auth matrix** — missing `Authorization` header → 401; `Bearer wrong` → 401; missing `CRON_SECRET` env → 401; correct Bearer → 200.
  2. **LIMIT enforcement** — mock `db.select` to return 51 due bells; assert `escalateBell` is invoked exactly 50 times; response `processed: 50`; structured log includes `eligible_total: 51` (or whatever the mock sets — see fragile area §3 about how the mock surfaces total vs. limit).
  3. **Concurrency cap** — mock `escalateBell` with a manual gate (a `Promise` that resolves on test command); start the cron; assert at the moment all gates have not yet resolved, the in-flight count is ≤ 10. Shape: count `escalateBell` invocations + `vi.advanceTimersByTime` to ensure ordering. (See Pressure-test §6 — this is the trickiest test; if the timing assertion is flaky, fall back to asserting "no more than 10 unresolved promises observed at any instant" via a counter that the mocked worker increments/decrements.)
  4. **Per-bell failure isolation** — mock 5 bells; bell #3's `escalateBell` rejects; assert response `processed: 5, failed: 1`; assert the other 4 still get called and resolve; structured log includes the failure.
  5. **Empty due-set** — `db.select` returns `[]`; response `processed: 0, failed: 0, eligible_total: 0`; `escalateBell` never called.

  Mock shape follows `tests/user-tombstone.test.ts:1-30` template: `vi.mock('@/lib/bell-escalation', () => ({ escalateBell: vi.fn() }))`. The select chain mock follows `tests/bell-active.test.ts:98-111`'s `makeSelectStub` helper — copy verbatim or extract to a shared helper if a third caller emerges (don't extract preemptively per CLAUDE.md "Three similar lines is better than a premature abstraction").

## Graveyard

(empty — entries dated when added)

## Anchors

- `app/api/bell/cron/route.ts:8-11` Bearer-token auth pattern is correct as-is. B4 does NOT migrate to typed `unauthorized()` helpers (L8's batch).
- `lib/bell-escalation.ts` atomic-update guard against double-escalation (`AND escalated_at IS NULL` in the UPDATE, `.returning()` empty-result check at line 20). Do not weaken — the safety belt is what makes per-batch concurrency safe even if a future cron tick overlaps with an in-flight one.
- Spec NN #14: "Bell escalates within the village (inner_circle → sitter at 5min, or immediately if all inner_circle decline). Never beyond." B4 changes cadence and bounds; it does NOT extend escalation scope. The cron only fires `notifyBellEscalated`, which only pings sitter-tier caregivers (`lib/notify.ts:286-294`).
- Spec §"Bell ring → escalate → respond" line 83: "If all inner_circle members respond `cannot` before the 5min timer → escalate immediately, do not wait the clock out." This path is owned by `app/api/bell/[id]/respond/route.ts` (verified by grep), NOT the cron, and is independent of cadence. B4 does not touch it.
- After B4: `vercel.json` carries the cron config. `lib/db/schema.ts` `bells` table has the supporting index. `app/api/bell/cron/route.ts` is bounded (LIMIT 50, concurrency 10) and structured-logged. The 5-minute escalation contract is operational in production.
- After B4: `lib/bell-escalation.ts` remains the per-bell worker; the cron is the bounded batch caller. Future enhancements to per-bell behavior live in the worker; future enhancements to batch-level scheduling/observability live in the cron route.

## Fragile areas

1. **`lib/db/schema.ts` is the schema-authority anchor.** Synthesis L11 flagged raw schema-mutating scripts as drifted; B4 explicitly uses `drizzle-kit generate` and adds a journal entry. Do NOT edit `drizzle/*.sql` by hand. Do NOT skip `db:doctor` after generate. If `db:doctor` flags a drift, stop and surface — do not paper over with a manual journal edit.
2. **`drizzle/meta/_journal.json` `when` ordering** — synthesis-grade incident on 2026-04-27 was caused by a stale `when` timestamp. Drizzle skips migrations whose `folderMillis` is `<=` the latest applied. After `db:generate`, verify the new `0006_bells_escalation_index` entry's `when` is greater than `0005_enum_backfill`'s by reading the file. `db:doctor` enforces this (`scripts/doctor.ts:80-86`) but the gate fires post-error.
3. **Postgres `IS NULL` on a composite b-tree index.** The query `WHERE status='ringing' AND escalated_at IS NULL AND created_at <= $cutoff` should plan as an index scan on `idx_bells_status_escalated_created`, but Postgres' use of b-tree indexes for `IS NULL` predicates is version-dependent and can fall back to a scan if the planner's stats disagree. Verification: in pre-launch staging, `EXPLAIN` the cron's query and confirm `Index Scan` (not `Seq Scan`). If the planner won't use the composite for `IS NULL`, fallback options: (a) partial index `WHERE escalated_at IS NULL`, (b) split the index. **Do not preemptively switch to a partial index — wait for staging EXPLAIN data.** Flagged here so the staging step doesn't get skipped.
4. **`maxDuration: 60` on Vercel Pro is the hard cap for serverless functions** (Hobby is 10s, Pro is 60s on the default Node runtime; longer requires Fluid Compute or background functions). 60 seconds is enough headroom for 50 bells × ~500ms per `escalateBell` worst case at concurrency 10 = ~2.5s per batch wave × 5 waves = ~12s. The 5x margin is intentional. If real-world latency proves the budget tight, the lever is concurrency cap (raise from 10 to 25), not LIMIT (raising LIMIT increases backlog drain at the cost of single-tick blast).
5. **Cron schedule cron expression syntax.** Vercel uses standard 5-field cron (minute, hour, day-of-month, month, day-of-week). `*/1 * * * *` is "every minute" — equivalent to `* * * * *`. The synthesis line 144 example used `* * * * *`. Both are valid; using `*/1` is slightly more explicit about intent. Either is acceptable — flagging in case the user prefers the bare `* * * * *`.
6. **Test concurrency-cap assertion fragility (Pressure-test §6 elaborates).** Asserting "in-flight count never exceeds 10" is timing-sensitive. The chosen approach uses a manual-gate pattern (each mocked worker increments a counter on entry, decrements on exit, asserts max via a high-water-mark variable). This avoids `vi.useFakeTimers()` and is the same shape used in real-world concurrency-limiter tests. If flakes appear in CI, the fallback is asserting only that the limiter eventually completes all 50 work items and produced 50 results — losing some assertion strength but gaining stability.

## Pressure-tested decisions (Protos §"Plan-reviewer" requirements)

These are the explicit pressure-tests requested. Each is on the page so the spec-reviewer can see the reasoning, not just the conclusion.

### §1 — Vercel Pro tier dependency

BUILD-LESSONS Principle 9 ("Check platform cron limits before designing timer-based features") and the 2026-04-26 lesson at `Apps/BUILD-LESSONS.md:185-188` document the prior incident — Vercel Hobby caps crons at once-daily, the Bell escalation feature was partially-broken until a Pro upgrade. **B4 assumes the Vercel project is on Pro tier.**

If the project is currently on Hobby:
- This batch cannot ship as-written. The `crons` array would be silently rejected at deploy time (or the deploy would fail with a tier-violation error, depending on Vercel's current behavior — surfacing the error message would require attempting the deploy).
- The user owns the billing decision. Surfacing here so it isn't discovered at PR-merge time.
- Alternative trigger paths if Pro is undesired: (a) external scheduler (GitHub Actions cron, EasyCron) hitting the route; (b) client-side response-time check on `/api/bell/active` polling that triggers an escalation request when the 5-minute mark passes (introduces a different bug class — multiple clients can race the trigger). These are workaround designs, not in B4 scope.

**Surfaced as a hard prereq in the frontmatter.** User confirms before Build phase begins.

### §2 — Cron cadence: `*/1 * * * *` (every minute) vs `*/5 * * * *` (every 5 min)

The synthesis line 144 example used every-minute (`* * * * *`). The spec contract is "5-minute window" but that's the *minimum* time before escalation, not the polling cadence.

**Per-minute polling argument:**
- The cron's WHERE clause filters bells where `created_at <= (now - 5min) AND escalated_at IS NULL`. A bell that crosses the 5-minute mark at 12:00:30 will:
  - With per-minute polling: be picked up at the 12:01:00 tick — escalated within ~30s of the 5-min mark.
  - With per-5-min polling at, say, 12:00:00 → 12:05:00: at 12:00:00 the bell isn't due yet (only 4:30 old). At 12:05:00 the bell is 9:30 old. Escalation fires up to 4:30 *after* the spec's 5-min promise — the "5-minute escalation" is now a "5-to-9.5-minute escalation."
- Per-minute polling makes the spec promise tight (escalation fires within ~5:00–6:00 of bell creation, never longer).
- Per-minute polling at 1440 invocations/day on Vercel Pro (10K invocations/day cron-budget; not the function-execution budget) is well within free-tier limits of the Pro plan's cron allocation. Verify Vercel's current Pro cron limits before commit (per BUILD-LESSONS Principle 9 on platform-limit verification).

**Per-5-min polling argument:**
- Cheaper. 288 invocations/day vs 1440.
- Aligned with the spec's 5-min number, "feels" right at first glance.
- Loses the spec contract on tail-latency: a bell rung at 12:00:30 doesn't escalate until 12:05:00 if the cron just fired at 12:00:00 — that's 4:30, breaching the "5-minute" promise on the long tail.

**Decision: `*/1 * * * *`.** Spec compliance over cost. The cost delta is negligible at 5K saturation; the tail-latency delta is observable to users. Push back if cost concern is real — happy to compromise at `*/2 * * * *` (every 2 min) which keeps tail-latency under 7 min.

### §3 — Bounded batch shape: LIMIT + `Promise.allSettled` over per-bell worker, vs single SQL `UPDATE ... RETURNING` batch

Two options on the table per synthesis line 152.

**Option A: LIMIT + bounded fan-out over `escalateBell` (chosen).** `db.select.limit(50)` → bound the result set → call `escalateBell` per row with concurrency cap. Pros: preserves the existing per-bell atomic guard (`AND escalated_at IS NULL` in the UPDATE), preserves the per-bell try/catch around `notifyBellEscalated` so a notification failure on one bell doesn't poison the batch's escalation state, preserves the L9-style separation of concerns (cron handles batching, worker handles per-bell semantics). Cons: N round-trips to the DB (50 SELECT-of-current + 50 UPDATE + 50 notify). At Vercel Pro Neon-pooled connection budget this is fine; at scale it could be optimized, but optimization belongs in a follow-up.

**Option B: Single `UPDATE bells SET escalated_at=now() WHERE status='ringing' AND escalated_at IS NULL AND created_at <= $cutoff RETURNING id` then iterate the returned IDs and call `notifyBellEscalated`.** Pros: one round-trip for the state mutation, atomic across the whole batch. Cons: (a) the per-bell atomic guard moves from per-row to per-batch — if `notifyBellEscalated` fails for bell X mid-iteration, bell X is already marked escalated in DB but the sitter-tier push never went out, and there's no path to retry without resetting `escalated_at`. (b) `lib/bell-escalation.ts`'s clean separation breaks — the worker's "atomically claim then notify" pattern would be split between SQL (claim) and the cron (notify), which is exactly the kind of impedance mismatch that produces L9-class bugs. (c) The current worker's `try { await notifyBellEscalated } catch { console.error }` per-bell isolation is harder to preserve when the claim is upstream of the notify loop.

**Decision: Option A.** Spec correctness (bell stays in `ringing` state until escalation fully completes including notify) and existing-pattern preservation outweigh the round-trip optimization. If round-trips become a bottleneck at scale (>50 bells/min sustained), the optimization is a separate batch with deliberate redesign of the claim/notify ordering.

### §4 — LIMIT value: 50 per tick

Synthesis line 152's recommendation. Justification:

- **Ceiling math:** 5K households × ~10 bells/min peak (`launch-readiness-5k.md` saturation table) = 10 bells/min globally. A backlog of 5 minutes is 50 bells. LIMIT 50 drains a 5-minute backlog in one tick at peak — for normal operation the LIMIT is never the bound, the actual due-set is smaller.
- **Backlog blast scenario:** if the cron is broken for 1 hour (deploy issue), the backlog is ~600 bells. LIMIT 50 + 1-min cadence drains in 12 minutes. Acceptable degradation.
- **maxDuration budget:** 60s function timeout. 50 bells × ~500ms-per-bell at concurrency 10 ≈ 12-15s per batch wave (50 bells / 10 concurrent = 5 waves × 500ms-2s per wave). Well within budget with 4x margin.
- **Why not LIMIT 25 or LIMIT 100?** 25 doubles backlog drain time. 100 doubles in-flight DB write load and brings us closer to the 60s timeout at p99 worker latency. 50 is the sweet spot.

### §5 — Concurrency cap on per-bell fan-out: hand-rolled vs `p-limit`

`p-limit` is 1.5KB, well-maintained, single-purpose, and the obvious off-the-shelf choice. But:

- **No precedent in this codebase.** Grep returned zero matches for `p-limit`, `pLimit`, or any concurrency-limiter pattern (verified in pattern scan above). Adding a runtime dep for one caller is a precedent-set, not a use-existing-pattern.
- **Hand-rolled is ~12 lines** (see File map). Same interface shape as `Promise.allSettled` so the existing failed-result filter at `route.ts:25` stays unchanged.
- **No second caller emerging.** Synthesis L13 (push outcome surfacing) and L17 (push pruning) don't need concurrency limiting (the push fan-out is already inside `lib/push.ts` and its bound is the subscription count per fan-out, not the recipient count).
- **Risk of hand-rolled bug:** the worker pool pattern (cursor + N parallel workers calling `next()` until cursor exhausts) is well-understood and trivially testable. Bug surface is low.

**Decision: hand-rolled, inline in `app/api/bell/cron/route.ts`.** Matches the codebase's flat-domain-named-files preference (B3 §1 pressure-test). If a second caller emerges, lift to `lib/concurrency.ts` then. Not now.

**Concurrency cap level: 10.** Justification:
- Per-bell fan-out: each `escalateBell` invocation does (1) SELECT current bell row, (2) UPDATE with atomic guard, (3) call `notifyBellEscalated` which does (a) SELECT bell, (b) SELECT eligible sitters, (c) `pushToUsers` which selects subscriptions and iterates (`Promise.all` inside `lib/push.ts`).
- 10 concurrent `escalateBell` × ~5-10 push subs each = up to 100 in-flight push HTTP calls at peak. Web Push services are happy with this; webpush library handles it.
- 10 concurrent `escalateBell` × ~3 DB queries each = up to 30 in-flight DB queries. Neon's connection pool default of 10 connections per Vercel function instance is the bound — at 30 queued, latency rises but doesn't fail. At cap 25 the queue depth would push connection-wait into the 60s function timeout.
- Per-batch concurrency cap inside the cron route, NOT per-push (which lives in `lib/push.ts` and already iterates over subs without bound — that's a separate concern, possibly L17/L18 territory). Asked to confirm in Pressure-test §6.

### §6 — Concurrency cap location: per-batch (cron-level) vs per-push (lib/push.ts level)

The user's prompt asked which level to apply the cap. The two surfaces are:

(a) **Per-batch in cron route:** caps how many `escalateBell` workers run at once. Shape: 50 due bells, max 10 in-flight `escalateBell` calls at any instant.

(b) **Per-push in `lib/push.ts`:** caps how many `webpush.sendNotification` calls fly out concurrently for a single fan-out. `lib/push.ts:66-87` currently uses unbounded `Promise.all` over subscription rows.

These are different bottlenecks. Per-batch limits DB load and overall in-flight count. Per-push limits HTTP load to push services within a single recipient set.

**Decision for B4: per-batch cap (option a) only.** Reasons:
- The cron's failure mode is "too many in-flight `escalateBell` calls at once" — that's a per-batch problem.
- Per-push concurrency inside `lib/push.ts` is a `lib/push.ts` problem — it affects every push fan-out (bell ring, shift posted, etc.), not just escalation. Touching it means modifying a high-blast-radius file with effects on every notification path. Out of scope for B4.
- L17 (push pruning) and L18 (subscription dedupe) are the right batches to consider per-push concurrency; they already touch `lib/push.ts`.

If a later batch lands per-push concurrency, the per-batch cap here is still useful as the outer bound — they compose, they don't conflict.

### §7 — Index migration: drizzle-kit generate vs raw SQL

Every prior schema change in this codebase used `drizzle-kit generate` (the `0001` through `0005` migrations all show the kit's generated comment headers). B2 (PR #45) introduced `0004_covey_enum_values.sql` and `0005_enum_backfill.sql` via the kit; the patterns are matured.

**Decision: `drizzle-kit generate`.** Edit `lib/db/schema.ts` to add the index callback, run `npm run db:generate`, commit the resulting `.sql` and `_journal.json` together. Verified by `db:doctor` post-generate.

### §8 — Backlog blast on first deploy

Synthesis Theme F note: "L14 first, L15 immediately after to avoid backlog blast." This is the explicit reason LIMIT is non-negotiable, not a perf nicety.

**Scenario:** the moment the cron starts firing, every bell with `created_at >= now - infinity AND escalated_at IS NULL AND status = 'ringing' AND created_at <= now - 5min` is in the due-set. In production today, no bell has ever been escalated by the cron — the un-shipped cron means `escalated_at` is `null` for every historical bell that was rung but not handled within 5 minutes. The DB has bells from beta usage going back to 2026-04-22.

- Current bells row count: small (beta — likely tens). Backlog drain in one tick if no bound.
- Future bells if launch happens before B4: thousands. Backlog blast at deploy time would saturate the function and time out.

LIMIT 50 + 1-min cadence is the safety bound. Even with thousands of due bells, the cron drains in N/50 ticks, never blocking on a single function invocation. Structured log surfaces `eligible_total` so backlog visibility is operational.

**Why this is not a separate batch:** L14 alone is a known footgun. Shipping the cron without LIMIT to "see what happens" is the kind of decision that creates the next BUILD-LESSONS entry. Pair them.

### §9 — Test strategy: unit vs route-integration

Two layers of test coverage are sensible:

(a) **Cron-route unit tests** (`tests/bell-cron.test.ts`): mock `db.select` to return controlled bell rows, mock `escalateBell` to assert call count and bound, assert auth, structured log, response shape. This is the level B4 ships.

(b) **Bounded-batch logic unit tests in isolation:** the `runWithConcurrency` helper could be tested separately. Decision: NO — the helper is inline in the route, ~12 lines, tested through the route's behavior. Extracting and testing in isolation is YAGNI-territory until a second caller emerges (§5 above).

**Migration test:** `npm run db:doctor` is the migration-correctness check (it's not a vitest test — it's a separate gate run before deploy). B4 plan declares it as a verification gate. No new doctor-extension work here (synthesis L12's coverage gap is out of scope — the bells `EXPECTED_COLUMNS` already includes `escalated_at`).

**Anti-pattern to avoid:** testing the cron by spinning up a real Postgres + real bells rows. The codebase pattern is mocked-`@/lib/db` (per `tests/bell-active.test.ts` and `tests/user-tombstone.test.ts`). Stay on pattern.

## Regression tests required (Hard Rule #6)

- `tests/bell-cron.test.ts` — new file, five describe blocks per File map. Exercises: auth matrix; LIMIT enforcement; concurrency cap; per-bell failure isolation; empty due-set. Every test asserts response shape AND structured-log shape (the log line is the operational surface — assert both keys and values).

Verification gate before declaring B4 done: `grep -rn "Promise.allSettled" app/api/bell/cron/route.ts` returns the new bounded-fan-out call (or zero matches if `runWithConcurrency` replaces it entirely — depends on internal naming). The bare `Promise.allSettled(due.map(...))` over an unbounded `due` array must NOT survive — that's the L15 defect. `db:doctor` clean post-generate.

## Stretch / non-blocking

- **Partial index `WHERE escalated_at IS NULL`** as a fallback if Postgres planner won't use the composite for the `IS NULL` predicate (Fragile area §3). Hold until staging EXPLAIN data. If needed, a follow-up migration.
- **Per-push concurrency in `lib/push.ts`** (Pressure-test §6 option b). Defer to L17/L18 batch. B4's per-batch cap is sufficient at 5K saturation.
- **Cadence tuning to `*/2` if cost matters** (Pressure-test §2). Reversible config change in `vercel.json`.
- **L12 doctor coverage extension.** Synthesis flagged the gap; B4 doesn't widen it. Separate batch.
- **Migration order in `vercel.json` `buildCommand`** (synthesis L30). Inverted-partial-deploy risk, but B4 doesn't touch this — L30's batch.
