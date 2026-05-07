/**
 * Pre-deployment verification for migration 0018_circle_invite_role_audit.
 *
 * Run BEFORE applying 0018 against prod Neon. Reports two things:
 *
 * 1. Count of pending invites whose inviter is a watcher. If non-zero, those
 *    rows need to be UPDATEd to household_mode='create_new' AFTER the
 *    migration runs (the column default would otherwise route them
 *    incorrectly per the audit's Fragile Areas section).
 *
 * 2. Total pending invites — sanity floor. If this is meaningfully larger
 *    than expected, there may be something else going on worth knowing
 *    before the migration lands.
 *
 * Usage (from covey-app/):
 *   DATABASE_URL=postgres://... npx tsx scripts/0018-precheck.ts
 *
 * After 0018 is applied, if (1) was non-zero, run the post-fix once:
 *   UPDATE family_invites
 *      SET household_mode = 'create_new'
 *    WHERE status = 'pending'
 *      AND from_user_id IN (SELECT id FROM users WHERE role = 'watcher');
 *
 * Verification post-migration (independent of journal — project memory says
 * the journal cannot be trusted):
 *
 *   SELECT column_name, data_type, is_nullable, column_default
 *     FROM information_schema.columns
 *    WHERE table_name = 'family_invites'
 *      AND column_name IN ('app_role', 'household_mode');
 *
 *   SELECT enumlabel FROM pg_enum
 *    WHERE enumtypid = 'household_mode'::regtype
 *    ORDER BY enumsortorder;
 *
 * Expected: app_role nullable, household_mode NOT NULL DEFAULT 'join_existing',
 * enum labels = ['join_existing', 'create_new'].
 */

import { config } from 'dotenv';
import postgres from 'postgres';

config({ path: '.env.local' });

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) {
    console.error('No DATABASE_URL or DATABASE_URL_UNPOOLED set — abort.');
    process.exit(1);
  }

  // Uses the postgres-js driver already in package.json (matches lib/db/index.ts).
  const sql = postgres(url, { max: 1, prepare: false });

  try {
    const watcherPending = await sql<{ n: number }[]>`
      SELECT COUNT(*)::int AS n
        FROM family_invites fi
        JOIN users u ON u.id = fi.from_user_id
       WHERE fi.status = 'pending'
         AND u.role = 'watcher'
    `;

    const totalPending = await sql<{ n: number }[]>`
      SELECT COUNT(*)::int AS n
        FROM family_invites
       WHERE status = 'pending'
    `;

    const watcherCount = watcherPending[0].n;
    const totalCount = totalPending[0].n;

    console.log('---');
    console.log('Migration 0018 precheck');
    console.log('---');
    console.log(`Total pending invites:        ${totalCount}`);
    console.log(`Pending watcher-initiated:    ${watcherCount}`);
    console.log('---');

    if (watcherCount === 0) {
      console.log('✅ Safe to apply 0018 with default household_mode.');
      console.log('   No post-migration UPDATE needed.');
    } else {
      console.log('⚠️  Watcher-initiated pending invites exist.');
      console.log('   After 0018 applies, run this UPDATE once:');
      console.log('');
      console.log("     UPDATE family_invites");
      console.log("        SET household_mode = 'create_new'");
      console.log("      WHERE status = 'pending'");
      console.log("        AND from_user_id IN (SELECT id FROM users WHERE role = 'watcher');");
      console.log('');
      console.log(`   Expected affected rows: ${watcherCount}`);
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
