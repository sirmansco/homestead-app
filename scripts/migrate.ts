/**
 * Runs pending Drizzle migrations against the configured database.
 *
 * IMPORTANT: the existing database already has the baseline schema applied
 * (we've been using `drizzle-kit push --force` up to now). For the 0000
 * baseline migration, run `npm run db:mark-baseline` FIRST — this records
 * the baseline as applied WITHOUT executing the CREATE TABLE statements.
 * After that, regular `npm run db:migrate` handles future migrations.
 *
 * Usage:
 *   npm run db:generate                # create a new migration from schema.ts changes
 *   npm run db:mark-baseline           # one-time: record 0000_baseline as applied
 *   npm run db:migrate                 # apply any pending migrations (0001+, etc.)
 */
import { config } from 'dotenv';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

config({ path: '.env.local' });

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

    console.log('Running pending migrations…');
    const db = drizzle(client);
    await migrate(db, { migrationsFolder: './drizzle' });
    console.log('✓ Migrations applied.');
  } finally {
    await client.end();
  }
}

run().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
