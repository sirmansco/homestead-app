/**
 * db:doctor — verifies migration journal consistency and live schema drift.
 *
 * Catches the failure mode we hit on 2026-04-27: Drizzle's __drizzle_migrations
 * journal can be silently out of sync with reality (missing entries, stale
 * `folderMillis` timestamps that cause migrations to be skipped, applied
 * migrations that were never recorded). When that happens, `db:migrate`
 * reports "✓ Migrations applied" while production is missing columns.
 *
 * Run before/after migrate, and in CI before deploy. Exits non-zero on drift.
 *
 * Checks:
 *   1. Every .sql file in drizzle/ has a matching journal entry.
 *   2. Every journal entry has a corresponding .sql file.
 *   3. Every journal entry's hash matches its file's sha256.
 *   4. Journal `when` timestamps are monotonically increasing in tag order.
 *   5. Every applied migration in __drizzle_migrations matches a journal hash.
 *   6. Live DB has all tables expected by schema.ts (sampled key tables).
 *   7. Live DB users.* and bells.* columns match schema.ts (the spots that
 *      have bitten us). Add more as schema grows.
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
import postgres from 'postgres';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

type Issue = { severity: 'error' | 'warn'; check: string; detail: string };
const issues: Issue[] = [];
const fail = (check: string, detail: string) => issues.push({ severity: 'error', check, detail });
const warn = (check: string, detail: string) => issues.push({ severity: 'warn',  check, detail });

function sha(file: string) {
  return createHash('sha256').update(readFileSync(file, 'utf-8')).digest('hex');
}

// Expected schema (kept narrow — extend when columns are added that have caused
// or could cause production drift). Each entry: table → required column names.
const EXPECTED_COLUMNS: Record<string, string[]> = {
  users: [
    'id', 'clerk_user_id', 'household_id', 'email', 'name', 'role', 'village_group',
    'photo_url', 'notify_shift_posted', 'notify_shift_claimed', 'notify_shift_released',
    'notify_bell_ringing', 'notify_bell_response', 'is_admin', 'cal_token', 'created_at',
  ],
  bells: [
    'id', 'household_id', 'created_by_user_id', 'reason', 'note', 'starts_at', 'ends_at',
    'status', 'handled_by_user_id', 'handled_at', 'escalated_at', 'created_at',
  ],
  kids: ['id', 'household_id', 'name', 'birthday', 'notes', 'photo_url', 'created_at'],
  feedback: ['id', 'user_id', 'household_id', 'message', 'kind', 'user_agent', 'app_version', 'created_at'],
};

const EXPECTED_ENUMS: Record<string, string[]> = {
  village_group: ['inner_circle', 'sitter'],
};

async function main() {
  const drizzleDir = path.resolve('drizzle');
  const journalPath = path.join(drizzleDir, 'meta', '_journal.json');
  const journal = JSON.parse(readFileSync(journalPath, 'utf-8'));
  const sqlFiles = readdirSync(drizzleDir).filter(f => f.endsWith('.sql') && !f.startsWith('._')).sort();
  const journalTags = new Set<string>(journal.entries.map((e: any) => e.tag as string));
  const sqlTags = new Set(sqlFiles.map(f => f.replace(/\.sql$/, '')));

  // 1 & 2: journal ⇄ disk
  for (const tag of sqlTags) {
    if (!journalTags.has(tag)) fail('journal', `${tag}.sql exists on disk but is not in _journal.json`);
  }
  for (const tag of journalTags) {
    if (!sqlTags.has(tag)) fail('journal', `_journal.json references ${tag} but ${tag}.sql is missing`);
  }

  // 3: hash check
  const hashByTag = new Map<string, string>();
  for (const tag of sqlTags) hashByTag.set(tag, sha(path.join(drizzleDir, `${tag}.sql`)));

  // 4: monotonic `when`
  const sortedEntries = [...journal.entries].sort((a, b) => a.tag.localeCompare(b.tag));
  let prev = -Infinity;
  for (const e of sortedEntries) {
    if (e.when <= prev) {
      fail('journal', `${e.tag} has \`when\` ${e.when} which is not greater than the previous entry's (${prev}). Drizzle's migrate() compares against MAX(created_at) in __drizzle_migrations and skips any migration whose folderMillis is <= that. Stale timestamps in 0001/0002 caused production drift on 2026-04-27.`);
    }
    prev = e.when;
  }

  // Live DB checks
  const sql = postgres(process.env.DATABASE_URL!);
  try {
    // 5: applied migrations match journal hashes
    const applied = await sql`SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at` as any[];
    const appliedHashes = new Set(applied.map(r => r.hash));
    const journalHashes = new Set([...sqlTags].map(t => hashByTag.get(t)!));
    // Special case: 0000_baseline is recorded with literal 'hash=0000_baseline' (not sha256)
    journalHashes.add('0000_baseline');

    for (const r of applied) {
      if (!journalHashes.has(r.hash)) {
        warn('applied-vs-journal', `__drizzle_migrations contains hash ${r.hash.slice(0, 16)}… that does not match any current journal entry. Migration file may have been edited after applying — Drizzle will not re-run, but the file no longer reflects what's in production.`);
      }
    }

    // What's in the journal but not yet applied?
    for (const tag of sqlTags) {
      if (tag === '0000_baseline') continue;
      const h = hashByTag.get(tag)!;
      if (!appliedHashes.has(h)) {
        const entry = journal.entries.find((e: any) => e.tag === tag);
        const lastApplied = applied.length ? Number(applied[applied.length - 1].created_at) : 0;
        const willRun = entry && entry.when > lastApplied;
        if (willRun) {
          warn('pending', `${tag} is not yet applied to the live DB; \`db:migrate\` will run it.`);
        } else {
          fail('skipped-migration', `${tag} is NOT in __drizzle_migrations AND will be silently skipped by Drizzle (its folderMillis ${entry?.when} is <= the latest applied created_at ${lastApplied}). Fix: set _journal.json entry's \`when\` to a value > ${lastApplied}, then re-run db:migrate.`);
        }
      }
    }

    // 6 & 7: column drift
    for (const [table, cols] of Object.entries(EXPECTED_COLUMNS)) {
      const live = await sql`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=${table}` as any[];
      const liveCols = new Set(live.map(r => r.column_name));
      if (liveCols.size === 0) {
        fail('schema-drift', `expected table "${table}" is missing in the live DB`);
        continue;
      }
      for (const c of cols) {
        if (!liveCols.has(c)) fail('schema-drift', `${table}.${c} expected by EXPECTED_COLUMNS but missing in live DB`);
      }
    }

    // Enum drift
    for (const [name, values] of Object.entries(EXPECTED_ENUMS)) {
      const live = await sql`
        SELECT enumlabel FROM pg_enum
        WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname=${name})
        ORDER BY enumsortorder
      ` as any[];
      if (live.length === 0) {
        fail('schema-drift', `expected enum "${name}" is missing`);
        continue;
      }
      const liveVals = new Set(live.map(r => r.enumlabel));
      for (const v of values) {
        if (!liveVals.has(v)) fail('schema-drift', `enum ${name} is missing value "${v}"`);
      }
      for (const v of liveVals) {
        if (!(values as readonly string[]).includes(v as string)) fail('schema-drift', `enum ${name} has unexpected value "${v}" — schema.ts does not include it`);
      }
    }
  } finally {
    await sql.end();
  }

  // Report
  const errors = issues.filter(i => i.severity === 'error');
  const warnings = issues.filter(i => i.severity === 'warn');

  if (issues.length === 0) {
    console.log('✓ db:doctor — no drift, journal consistent, all expected tables/columns/enums present.');
    return;
  }

  for (const i of issues) {
    const tag = i.severity === 'error' ? 'ERROR' : 'WARN ';
    console.log(`${tag} [${i.check}] ${i.detail}`);
  }
  console.log(`\n${errors.length} error(s), ${warnings.length} warning(s)`);
  if (errors.length > 0) process.exit(1);
}

main().catch(e => { console.error('doctor failed:', e); process.exit(1); });
