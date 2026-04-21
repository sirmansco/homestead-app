import { config } from 'dotenv';
config({ path: '.env.local' });
import postgres from 'postgres';

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL!;
const sql = postgres(url, { prepare: false });

async function main() {
  await sql`CREATE TABLE IF NOT EXISTS kids (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    name text NOT NULL,
    birthday date,
    notes text,
    created_at timestamp NOT NULL DEFAULT now()
  )`;

  await sql`CREATE INDEX IF NOT EXISTS kids_household_idx ON kids(household_id)`;

  console.log('✓ kids table created');
  await sql.end();
}
main().catch(e => { console.error(e); process.exit(1); });
