/**
 * Runs pending Drizzle migrations against the configured database.
 *
 * Always runs `db:doctor` BEFORE migrate (refuses to migrate against a drifted
 * DB; you must reconcile first) and AFTER migrate (verifies the migration
 * actually closed the drift). This guards against the 2026-04-27 failure
 * mode where Drizzle silently skipped 0001/0002 due to stale `when`
 * timestamps in _journal.json and reported "✓ Migrations applied" anyway.
 *
 * Usage:
 *   npm run db:generate                # create a new migration from schema.ts changes
 *   npm run db:mark-baseline           # one-time: record 0000_baseline as applied
 *   npm run db:migrate                 # apply any pending migrations (0001+, etc.)
 *   npm run db:doctor                  # verify journal + schema consistency
 */
import { config } from 'dotenv';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { spawnSync } from 'node:child_process';

config({ path: '.env.local' });

function runDoctor(phase: 'pre' | 'post'): void {
  console.log(`\n[${phase}-flight] running db:doctor…`);
  const result = spawnSync('npx', ['tsx', 'scripts/doctor.ts'], { stdio: 'inherit' });
  if (result.status !== 0) {
    console.error(`\n✗ db:doctor (${phase}-flight) reported drift. Aborting migrate.`);
    console.error('  Reconcile the journal/schema before migrating. See scripts/doctor.ts for what it checks.');
    process.exit(1);
  }
}

const DATABASE_URL = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL or DATABASE_URL_UNPOOLED required');
  process.exit(1);
}

async function run() {
  const client = postgres(DATABASE_URL!, { max: 1, prepare: false });

  try {
    const markBaseline = process.argv.includes('--mark-baseline');
    if (markBaseline) {
      await client`CREATE SCHEMA IF NOT EXISTS drizzle`;
      await client`
        CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
          id SERIAL PRIMARY KEY,
          hash TEXT NOT NULL,
          created_at BIGINT
        )
      `;
      const existing = await client`SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = '0000_baseline' LIMIT 1`;
      if (existing.length === 0) {
        await client`INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('0000_baseline', ${Date.now()})`;
        console.log('✓ Baseline migration marked as applied (schema already existed in DB).');
      } else {
        console.log('✓ Baseline already recorded — nothing to do.');
      }
      return;
    }

    runDoctor('pre');

    console.log('\nRunning pending migrations…');
    const db = drizzle(client);
    await migrate(db, { migrationsFolder: './drizzle' });
    console.log('✓ Drizzle migrate() returned successfully (note: this does NOT mean SQL ran — see post-flight check).');
  } finally {
    await client.end();
  }

  runDoctor('post');
  console.log('\n✓ Migrations applied and verified.');
}

run().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
