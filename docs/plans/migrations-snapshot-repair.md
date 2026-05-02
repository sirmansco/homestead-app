---
title: Migrations — snapshot repair + missing default migration
date: 2026-05-02
status: pending
governs: synthesis L11 (raw schema-mutating scripts that bypass Drizzle / journal drift class) — narrows it to the snapshot-side
parent-audit: docs/plans/launch-audit-2026-05-02/synthesis.md
batch-id: B-snapshots
prereqs: none
unblocks: B4 (cron escalation), and any future schema change that runs `db:generate`
---

## Spec

`drizzle-kit generate` has been silently producing dirty migration files since `0004` because three snapshot files were never committed: `0001_snapshot.json`, `0004_snapshot.json`, `0005_snapshot.json`. The kit's pending-diff is computed against the highest-numbered snapshot it can find on disk (`0003_snapshot.json`); every `db:generate` since `0004` shipped has therefore re-emitted the changes from `0004` and `0005` (the enum value adds and column default changes) into the next migration.

This means:

1. **B4's `db:generate` produced a dirty `0006`** that bundled the enum/default ALTERs alongside the new `CREATE INDEX`. Discovered during the B4 build phase. B4 is blocked.
2. **A previously-uncommitted schema change actually exists**: the `village_group` column default in `lib/db/schema.ts` is `'covey'`, but no migration has ever set this default in production. `0005_enum_backfill.sql` only `UPDATE`s rows; it does not `ALTER COLUMN ... SET DEFAULT`. Prod's column default is still `'inner_circle'` (set by `0002_v1_schema.sql` Part 1f). Every kit-generate has correctly identified this drift and emitted the `SET DEFAULT 'covey'` ALTERs — which was always pending real work, not just a snapshot artifact.

The repair has two distinct surfaces and they must ship together: rebuilding the missing snapshots (so future generates are clean) and shipping the genuinely-missing default migration (so prod matches `schema.ts`). Splitting them risks the snapshot rebuild missing the legitimate pending diff and locking the codebase into "current schema.ts is the prod state" when prod is actually one ALTER short.

**Done criteria:**

- Three snapshot files exist on disk and are committed: `drizzle/meta/0001_snapshot.json`, `drizzle/meta/0004_snapshot.json`, `drizzle/meta/0005_snapshot.json`. Each represents the schema state *after* its corresponding migration. The `prevId` chain is `00000000... → 0000 → 0001 → 0002 → 0003 → 0004 → 0005`.
- A new migration `drizzle/0006_village_group_default.sql` exists, contains exactly the two `ALTER COLUMN ... SET DEFAULT 'covey'` statements (one for `users`, one for `family_invites`), and is recorded in `_journal.json` with monotonic `when`. Sister snapshot `drizzle/meta/0006_snapshot.json` matches the post-migration state.
- Running `npm run db:generate` against the current `schema.ts` produces `No schema changes, nothing to migrate` (or whatever the kit's no-op message is). This is the falsifiable test that the snapshot rebuild is correct.
- `npm run db:doctor` is clean on staging/prod after migrate.
- `scripts/doctor.ts` extended with check #8: every `.sql` file in `drizzle/` has a matching `meta/<tag>_snapshot.json` (excluding `0000_baseline` if its snapshot is named differently — verified at write time). Failure mode: warn, not error, on first deploy after this batch lands; promote to error one batch later. (See Pressure-test §4.)
- The B4 plan can be resumed: a fresh `npm run db:generate` on top of the B4 schema edit produces a clean single-line `CREATE INDEX` migration `0007`.

**Out of scope:**

- Rewriting any of the existing migrations. `0001`–`0005` remain on disk and in the journal exactly as they are; only the *snapshots* are reconstructed.
- Reconstruction of `0000_snapshot.json` (it exists). The repair only fills the gaps.
- Synthesis L11's "raw schema-mutating scripts" finding (the `scripts/migrate-*.ts` files). Different surface, different fix; B-snapshots covers the snapshot-drift half of L11's "Drizzle is source of truth" bar but not the side-script half.
- Any other indexing work or schema changes. The new `0006_village_group_default.sql` contains *only* the default ALTERs that `db:generate` is currently emitting — not the bells index B4 wants. B4's index is generated as `0007` after B-snapshots merges.
- A `drizzle-kit pull`/`introspect`-based regeneration. See Pressure-test §3 for why this is rejected as the primary repair mechanism.

## Conventions

Pattern scan of B-snapshots surface (`drizzle/`, `drizzle/meta/`, `scripts/doctor.ts`, `scripts/migrate.ts`):

- **Snapshot file shape:** verified by reading `0000`, `0002`, `0003` snapshots. Top-level: `{ id (uuid), prevId (uuid), version: "7", dialect: "postgresql", tables: {...}, enums: {...}, schemas: {...}, sequences: {...}, ... }`. Each snapshot represents post-tag schema state. The `prevId` chain wires snapshots together; gaps in the chain (current state) cause the kit's diff base to fall back to whichever snapshot it can find.
- **`prevId` chain integrity:** the kit enforces a **strictly linear chain** — no two snapshots may share a `prevId`. **Empirically verified during build (2026-05-02):** the first generate attempt with `0001.prevId = 0000.id` AND `0002.prevId = 0000.id` (the original-on-disk state) failed immediately with `Error: [drizzle/meta/0001_snapshot.json, drizzle/meta/0002_snapshot.json] are pointing to a parent snapshot ... which is a collision`. The repair therefore must:
  1. Reconstruct `0001` with a fresh id and `prevId = 0000.id`, AND
  2. Repoint `0002.prevId` from `0000.id` to `0001.id` so the DAG collapses into a linear chain.

  Doctor doesn't hash `meta/*.json` files — only `drizzle/*.sql` (`scripts/doctor.ts:34-36`) — so mutating an existing snapshot's `prevId` is safe from doctor's perspective. The hard constraint is "do not mutate any snapshot's `id`" (downstream `prevId`s reference it). `prevId` adjustments to fix the chain are allowed.

  **Original plan hypothesis (now disproved):** an earlier draft of this section claimed the kit walked `prevId`s loosely and tolerated parallel siblings. That was wrong. Linear chain is required. Section rewritten 2026-05-02 after build-phase discovery.

  **Concrete chain post-repair (linear):**
  - `0000.id = 43e4d32a-ed17-49b1-b700-ee2ecea2eea0`, `prevId = 00000000-...`
  - `0001.id = 60de82d8-b797-45a7-ba02-f24cf84ad0cb` (new), `prevId = 43e4d32a-...`
  - `0002.id = b1c2d3e4-f5a6-7890-abcd-ef1234567890` (existing), `prevId = 60de82d8-...` (**REPOINTED** from `43e4d32a-...`)
  - `0003.id = d9ca87ff-3293-4302-bb48-0fc5ce5ff13c` (existing, untouched), `prevId = b1c2d3e4-...` (existing, untouched)
  - `0004.id = 054cedfa-2863-4cde-9283-c4e110af2610` (new), `prevId = d9ca87ff-...`
  - `0005.id = a53321b8-5bb3-43f0-8790-5eae08db643c` (new), `prevId = 054cedfa-...`
  - `0006.id = b6b572fb-cd7f-4c67-b8b2-0de136e1debf` (kit-generated), `prevId = a53321b8-...`

  Pressure-test: after rebuild, `db:generate` must report "No schema changes, nothing to migrate" (the legitimately-pending default ALTER lands as `0006`, not as a phantom diff).

- **Migration semantics already applied to prod (verified by `db:doctor` being clean):**
  - `0001` adds 5 `notify_*` boolean columns to `users`.
  - `0002` reduces `village_group` enum to `(inner_circle, sitter)`, sets defaults to `'inner_circle'`, adds `users.is_admin`, adds `bells.escalated_at`, creates `feedback` table.
  - `0003` adds `users.cal_token`.
  - `0004` adds `'covey'` and `'field'` to the `village_group` enum (both with `IF NOT EXISTS`). Enum values now `(inner_circle, sitter, covey, field)`.
  - `0005` data-migrates rows: `inner_circle → covey`, `sitter → field`. Column default still `'inner_circle'`.

- **What the missing default-migration must do:** `ALTER TABLE users ALTER COLUMN village_group SET DEFAULT 'covey'` and same for `family_invites`. Idempotent — running twice is a no-op. Safe to ship.

- **Doctor's existing checks** (`scripts/doctor.ts:13-21`): journal-disk consistency (1, 2), file hash (3), monotonic `when` (4), applied-vs-journal (5), live column drift (6, 7), enum drift. **No snapshot-file existence check.** That's the gap to close.

## File map

- **`drizzle/meta/0002_snapshot.json` — edit (`prevId` repoint only).**
  Change `prevId` from `43e4d32a-ed17-49b1-b700-ee2ecea2eea0` (0000.id) to `60de82d8-b797-45a7-ba02-f24cf84ad0cb` (the new 0001.id) to linearize the chain. `id` stays at `b1c2d3e4-...` so `0003.prevId` (which points at `0002.id`) is preserved. No table/column/enum body changes.

- **`drizzle/meta/0001_snapshot.json` — new file (reconstruction).**
  Structure: copy `0000_snapshot.json`, mutate `users.columns` to add the five `notify_*` boolean columns (each `notNull: true, default: true`), set new `id` to a freshly-minted UUID, keep `prevId = 0000.id` (`43e4d32a-...`).

  How to source the diff: read `0001_notification_prefs.sql` and `0000_snapshot.json` side-by-side. Five additive columns, no other changes. Cross-check by diffing against `0002_snapshot.json`'s `users.columns` — those five columns are present in `0002` but not in `0000`, confirming `0001` is where they were added.

- **`drizzle/meta/0004_snapshot.json` — new file (reconstruction).**
  Structure: copy `0003_snapshot.json`, mutate the `enums.public.village_group.values` array from `["inner_circle", "sitter"]` to `["inner_circle", "sitter", "covey", "field"]`, set new `id`, set `prevId = 0003.id` (`d9ca87ff-...`). No column or default changes (those are in `0005` and the new `0006`).

  How to source: read `0004_covey_enum_values.sql` — two `ALTER TYPE ADD VALUE` statements. That's the entire change.

- **`drizzle/meta/0005_snapshot.json` — new file (reconstruction).**
  Structure: copy `0004_snapshot.json`, set new `id`, set `prevId = 0004.id`. **No structural changes from 0004** — `0005` is rows-only (`UPDATE` data migration). Snapshots represent schema, not data; an UPDATE-only migration produces a snapshot that's structurally identical to its predecessor but with a new id linking it into the chain.

  How to source: read `0005_enum_backfill.sql` — four UPDATE statements, no ALTERs. Confirms snapshot is structurally a copy of 0004.

- **`lib/db/schema.ts` — no edit.** This batch reconstructs snapshots and ships the missing default migration; it does NOT modify `schema.ts`. The default in `schema.ts` already reads `.default('covey')` — that value is what's been driving the kit's pending-diff. Repair brings prod and snapshots in line with it; schema.ts stays unchanged.

- **`drizzle/0006_village_group_default.sql` — new file (hand-written, minimal).**
  Contents:
  ```sql
  -- Aligns prod column defaults with schema.ts after the 0004/0005 enum work.
  -- 0005 data-migrated rows from inner_circle/sitter to covey/field; this
  -- catches the column-default rename that was committed to schema.ts but
  -- never ALTERed in prod (would have been auto-emitted by db:generate, but
  -- generate has been silently re-bundling 0004/0005 changes since 0003 was
  -- the last committed snapshot — see docs/plans/migrations-snapshot-repair.md).
  ALTER TABLE "users" ALTER COLUMN "village_group" SET DEFAULT 'covey';--> statement-breakpoint
  ALTER TABLE "family_invites" ALTER COLUMN "village_group" SET DEFAULT 'covey';
  ```
  Hand-written rather than kit-generated to keep the diff trivially auditable. Doctor will hash this file and store the hash in the journal entry; the generate step is replaced by a manual journal append.

- **`drizzle/meta/0006_snapshot.json` — new file (reconstruction).**
  Copy `0005_snapshot.json`, mutate `users.columns.village_group.default` from `"'inner_circle'"` to `"'covey'"`, same for `family_invites.columns.village_group.default`, set new `id`, set `prevId = 0005.id`.

- **`drizzle/meta/_journal.json` — edit.**
  Append a sixth `entries` element:
  ```json
  {
    "idx": 6,
    "version": "7",
    "when": <timestamp greater than 0005's `when` 1777645484001 — use Date.now() at edit time, captured to a constant>,
    "tag": "0006_village_group_default",
    "breakpoints": true
  }
  ```
  Doctor's monotonic-`when` check (line 80-86 of `scripts/doctor.ts`) enforces strict ordering. Use a current `Date.now()` value; today's millis are well above `0005`'s.

- **`scripts/doctor.ts` — edit (add check #8).**
  After the existing journal/file consistency checks, add a snapshot-existence check. **Important matching detail (discovered during build):** the kit names snapshot files by numeric prefix (`0006_snapshot.json`), NOT by full tag (`0006_village_group_default_snapshot.json`). The check matches `<tag>.sql` to `<numeric-prefix>_snapshot.json`. The original draft of this section incorrectly matched on full tag and would have false-warned forever; the as-shipped code matches by extracting the leading digits of each tag.
  ```ts
  // 8: snapshot ⇄ migration. Every migration tag has a matching meta/<tag>_snapshot.json
  // (matched by tag's numeric prefix — kit names snapshots <idx>_snapshot.json, not <full-tag>_snapshot.json).
  const snapshotFiles = readdirSync(path.join(drizzleDir, 'meta'))
    .filter(f => f.endsWith('_snapshot.json') && !f.startsWith('._'));
  const snapshotPrefixes = new Set(snapshotFiles.map(f => f.replace(/_snapshot\.json$/, '')));
  for (const tag of sqlTags) {
    const prefix = tag.match(/^(\d+)_/)?.[1];
    if (!prefix) continue;
    if (!snapshotPrefixes.has(prefix)) {
      warn('snapshot-missing', `${tag}.sql exists on disk but meta/${prefix}_snapshot.json is missing — drizzle-kit generate will produce dirty migrations bundling all changes since the last present snapshot. Reconstruct the snapshot before the next schema change.`);
    }
  }
  ```
  **Severity: warn, not error**, for one batch after this lands. Pressure-test §4 explains why. Promote to error in the batch after — at that point the snapshots are reconstructed, doctor enforces, and any future regression flags loudly.

  Also extend the file header comment block to document check 8.

- **`tests/migrations-snapshot.test.ts` — new file (~60 lines).**
  Three describe blocks — the regression test for this batch's correctness:
  1. **Snapshot existence** — assert that for every `.sql` file in `drizzle/`, a corresponding `_snapshot.json` exists in `drizzle/meta/` (modulo the `0000_baseline` special case). This is the regression test for the bug we just hit.
  2. **`prevId` chain integrity** — walk each snapshot's `prevId` and verify it matches some other snapshot's `id` (or the zero-uuid for `0000`). No orphans.
  3. **Schema-state spot checks** — for each reconstructed snapshot, assert one identifying column or enum value to confirm the snapshot reflects the right post-migration state. (E.g., `0001_snapshot.json` has `notify_shift_posted` in `users.columns`; `0004_snapshot.json` has `'covey'` in `enums.village_group.values`; `0006_snapshot.json` has `default: "'covey'"` on `users.village_group`.)

## Graveyard

(empty — entries dated when added)

## Anchors

- `0000_snapshot.json`, `0002_snapshot.json`, `0003_snapshot.json` are kit-generated and known-good. **Do not modify them.** Their `id`/`prevId` values are referenced by the reconstructed snapshots' `prevId` fields; changing them would re-orphan the chain.
- `0001_notification_prefs.sql`, `0002_v1_schema.sql`, `0003_empty_doorman.sql`, `0004_covey_enum_values.sql`, `0005_enum_backfill.sql` are applied to prod and recorded in `__drizzle_migrations`. **Do not modify them.** Doctor's hash check (line 76) compares the file's sha256 to the journal entry's hash; any byte change fails the check.
- After repair: `db:generate` against the current `schema.ts` returns "no changes." That's the falsifiable proof. If it emits anything, the snapshot repair is wrong somewhere.
- After repair: doctor passes both existing checks AND the new snapshot-existence check (warn-mode in this batch).
- `scripts/migrate.ts` is the prod migration entrypoint. It reads from `_journal.json` and applies any unapplied entries. Adding `0006_village_group_default` to the journal means the next `npm run db:migrate` (which Vercel runs in `buildCommand`) will execute the two ALTERs.
- After repair: B4's `db:generate` produces a clean single-line `0007_<random>.sql` containing just the `CREATE INDEX`. B4's plan is updated to reference `0007` instead of `0006`.

## Fragile areas

1. **`drizzle/meta/_journal.json` `when` ordering.** Doctor's check at line 80-86 was added in `f0131bf` after the 2026-04-27 production drift incident. Any new entry must have a `when` strictly greater than its predecessor. Use a real `Date.now()` at write-time, not a hand-typed value; mistyping by an order of magnitude causes the kit to skip the migration silently.

2. **Snapshot `id` collisions.** Snapshot ids are UUIDs. The reconstruction generates new UUIDs for `0001`/`0004`/`0005`/`0006`; these MUST NOT collide with any existing snapshot id (`0000`, `0002`, `0003`). Use `crypto.randomUUID()` or a real UUID v4 generator at write time. If two snapshots had the same `id`, the kit's chain walker could short-cycle.

3. **Postgres `ALTER TABLE ... SET DEFAULT` is non-transactional in some Postgres versions.** Verified for PG 15+ (Neon's current version): `SET DEFAULT` is fast metadata-only and runs in the migration transaction. No table rewrite, no row scan. Safe to ship without staging soak. The previous default change was implicit (column-type swap in `0002` Part 1f) so we have prior art for the same operation.

4. **Doctor's check #8 in error-mode would fire on the existing pre-repair state.** That's why the first ship is warn-mode. Once the repair lands and snapshots exist, the next batch flips warn → error. If we shipped error-mode in this batch, the deploy that introduces the fix would also be the deploy that hits its own gate — race-condition. Pressure-test §4 expands.

5. **`drizzle-kit introspect` (or `pull`) would overwrite snapshots from live DB.** It would not preserve the per-migration history; it would emit one snapshot reflecting the current state. We do NOT use it as the primary repair tool because it loses the chain semantics — Pressure-test §3 elaborates. Mentioned here so future operators don't reach for it as a "easier" fix.

6. **The kit enforces a strictly linear `prevId` chain — DAGs are rejected at generate time.** Empirically discovered during build (2026-05-02): the first generate attempt with two snapshots (`0001` and `0002`) sharing `prevId = 0000.id` failed immediately with `Error: ... pointing to a parent snapshot ... which is a collision`. The repair therefore both reconstructs `0001` AND repoints `0002.prevId` from `0000.id` to `0001.id`. After repair the chain is fully linear: `0000 → 0001 → 0002 → 0003 → 0004 → 0005 → 0006`. An earlier draft of this fragile-area note hypothesized the kit tolerated parallel siblings; that hypothesis is wrong and is preserved here only as a warning to future operators. The falsifiable test is `db:generate produces "no changes"`; if that fails after a future repair, the chain is the first place to look.

## Pressure-tested decisions

### §1 — Reconstruct snapshots vs `drizzle-kit pull/introspect` from live DB

`drizzle-kit pull` reads `information_schema` from the live DB and emits a snapshot. It would produce *one* snapshot reflecting the current state, not per-tag history. After running it, the kit's `prev` chain is shortened to one snapshot post-introspect, and any future generate computes diffs against introspected-state, which is correct.

**Why not pull:**
- It loses the per-tag schema history. If a future operator wants to ask "what did the schema look like after `0003`?" — that question becomes unanswerable. The whole point of versioned migrations is that the snapshots tell the story alongside the SQL.
- It requires live DB access at repair time. Repair work that depends on prod DB connectivity is fragile (different env, different version, different time).
- It can't validate the legitimately-pending diff (the `SET DEFAULT 'covey'`). Pull would emit current-prod-default `'inner_circle'` as the live state, then the next generate would re-emit the `SET DEFAULT 'covey'` ALTER as pending — same problem we have today, just with one fewer snapshot file to maintain.

**Reconstruct manually:** read each migration's SQL and apply the changes to the prior snapshot. ~5-10 minutes per snapshot. The diffs are small (5 columns added, 2 enum values added, 1 default change). Hand-reconstructed snapshots are auditable in PR review; pull-generated ones are an opaque blob.

**Decision: hand-reconstruct.** Push back welcomed if you'd rather pull-and-move-on; the maintenance argument is strong but not absolute.

### §2 — Bundle the snapshot repair with the missing default migration in one batch, vs split

Splitting them is tempting: snapshot repair has zero prod-state effect; default migration has real ALTER TABLE statements. Different blast radius.

**Why bundle:**
- Snapshot repair without the default migration is incomplete: the kit's pending-diff against the new `0005_snapshot.json` would still show `SET DEFAULT 'covey'` as pending (because `0005_snapshot` reflects post-`0005`-row-update state, where the column default is still `'inner_circle'`). The next operator runs generate, gets a `0006_<random>.sql` containing the default ALTER, and either ships it (correct outcome but achieved by accident) or strips it as "phantom" again.
- Shipping the default migration without snapshot repair means the next generate after that *still* re-emits the default ALTER (because `0003_snapshot` still doesn't know about the snapshots that would have come after).
- Both halves are required for "no future generate emits phantom changes." Splitting means two ship cycles for one outcome.

**Why split:**
- Smaller PRs are easier to review.
- If the snapshot repair is wrong, the default migration is unrelated and shouldn't be entangled.

**Decision: bundle.** The default migration is one file, two lines of SQL, and the snapshot repair is the only context that explains why it's needed now. Reviewer reads them together. If the snapshot repair is wrong, the default migration's correctness is independent — it still ships the actual prod state change.

### §3 — Doctor's check #8 severity: warn vs error in this batch

If shipped as `error`, the deploy that introduces the fix would fail its own gate before snapshots are reconstructed. Race condition.

If shipped as `warn`:
- This batch lands. Snapshots reconstructed in the same PR. Doctor warn fires on the deploy if any snapshot is still missing — useful debug signal but not a hard gate.
- One batch later, flip warn → error. By then snapshots exist and the gate enforces.

**Decision: warn in this batch, error in the immediate follow-up batch.** Same pattern as gradual rollout for any breaking-change gate.

The follow-up batch is small (~3 lines of doctor edit). Could also be a fixup commit on this PR after the snapshots are confirmed in CI. Surfacing for user choice.

### §4 — `_journal.json` `when` for `0006_village_group_default`

`0005_enum_backfill`'s `when` is `1777645484001`. Today's `Date.now()` is somewhere around `1777738035640` (verified — that's what the kit just produced for the deleted-and-regenerated 0006). So a value of `1777738200000` (a couple minutes later) is safe. Use a real `Date.now()` captured at edit time, not a hand-typed number.

### §5 — Order of operations in the PR

Reconstruction and migration must produce a single coherent state. The order in commits doesn't matter (squash-merge), but the order in execution does:

1. Reconstruct `0001`, `0004`, `0005` snapshots.
2. Run `npm run db:generate` — should produce the `SET DEFAULT 'covey'` migration cleanly into a kit-named file (e.g., `drizzle/0006_<random>.sql`).
3. Rename that kit-generated migration to `0006_village_group_default.sql` and commit. (Or hand-write — see Pressure-test §6.)
4. Add the journal entry for `0006`.
5. Generate `0006_snapshot.json` — either from the kit's own write during step 2, or hand-constructed from `0005_snapshot.json` + the default change.
6. Add doctor check #8.
7. Run `npm run db:generate` again — must report "no changes."
8. Run `npm run db:doctor` — must pass with at most warn-level entries about pending migration.

Step 7 is the falsifiable proof. Step 8 covers the journal/file consistency.

### §6 — Hand-write `0006_village_group_default.sql` vs use the kit's auto-named output

The kit names migrations like `0006_magical_alice.sql` (random-word suffix). Hand-writing lets us name it descriptively. The downside: doctor stores the file's sha256 hash in `_journal.json` against the entry, and any byte mismatch fails. Hand-writing the file means hand-computing or letting `db:doctor`/`db:migrate` read the hash on first run — but `db:migrate` records the hash *into prod's `__drizzle_migrations`*, not the journal. The journal's `when` and `tag` are the authority; the file hash is computed at doctor-run time. So hand-writing is fine.

**Decision: hand-write.** The descriptive name (`0006_village_group_default`) is worth more than the kit's word-pair suffix.

### §7 — Tests for the snapshot reconstruction

Two test pieces are valuable:

(a) Static snapshot-existence check (`tests/migrations-snapshot.test.ts`) — runs in vitest, asserts every `.sql` has a `_snapshot.json`, every `prevId` resolves. Cheap, runs in CI on every push. Regression test for the original bug.

(b) Live-DB roundtrip: spin up an empty Postgres, run all migrations in order, dump schema, compare to current `schema.ts`-derived expectation. Way too heavy for this batch. The static check + `db:doctor` covers 90%; the live-DB check is what staging-soak provides outside the test suite.

**Decision: static check only.** Live-DB roundtrip is a separate "migrations CI" project, not B-snapshots scope.

## Regression tests required (Hard Rule #6)

- `tests/migrations-snapshot.test.ts` — assert every `drizzle/*.sql` has a matching `meta/<tag>_snapshot.json`; assert `prevId` chain resolves for every snapshot (no orphans except `0000` whose prevId is the zero-uuid); assert spot-check schema state for each reconstructed snapshot (notify_* cols in 0001, covey enum value in 0004, covey default in 0006).
- The `db:generate produces no changes` proof is run at PR-build time but isn't a vitest assertion. Captured in PR description (`Verification` section) with the actual command output.

Verification gate before declaring this batch done: `npm run db:generate` outputs "No schema changes, nothing to migrate" (or the kit's equivalent — confirm exact wording during build). `npm run db:doctor` clean against the new state.

## Stretch / non-blocking

- Promote doctor check #8 from warn to error in a follow-up PR (~3 lines).
- Document the snapshot file format in a `drizzle/README.md` so future operators don't have to reverse-engineer it. Out of scope for this batch.
- Investigate whether `drizzle-kit` has a flag to enforce snapshot-file presence (`--strict-snapshots` or similar). If yes, future kit versions might enforce it natively. Not load-bearing for this batch.
- Audit `scripts/migrate-*.ts` (synthesis L11 — raw schema-mutating scripts). Different surface, separate batch.
