import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

// B7 DB indexing pass — source-grep assertions for all 8 indexes (L20/L21/L22).
// No DB connection required. Pattern: same source-grep style as
// tests/push-dedup-migration.test.ts and tests/migrations-snapshot.test.ts.
//
// Falsifiability: removing any index declaration from schema.ts or the SQL
// file causes the corresponding test to go red.

const SCHEMA_FILE = path.resolve(__dirname, '..', 'lib', 'db', 'schema.ts');
const DRIZZLE_DIR = path.resolve(__dirname, '..', 'drizzle');
const META_DIR = path.join(DRIZZLE_DIR, 'meta');
const MIGRATION_TAG = '0010_nappy_leader';
const MIGRATION_FILE = path.join(DRIZZLE_DIR, `${MIGRATION_TAG}.sql`);

describe('B7 hot-path indexes — schema declarations', () => {
  let schema: string;

  beforeAll(() => {
    schema = readFileSync(SCHEMA_FILE, 'utf-8');
  });

  // L20 — /api/lantern/active polling index
  it("schema declares idx_lanterns_household_status_ends_at on (householdId, status, endsAt)", () => {
    expect(schema).toContain("index('idx_lanterns_household_status_ends_at')");
    expect(schema).toContain('idx_lanterns_household_status_ends_at');
    // columns appear in order
    const idx = schema.indexOf('idx_lanterns_household_status_ends_at');
    const after = schema.slice(idx, idx + 200);
    expect(after).toMatch(/t\.householdId.*t\.status.*t\.endsAt/s);
  });

  // L20 — bell_responses join index
  it("schema declares idx_lantern_responses_lantern_id on (lanternId)", () => {
    expect(schema).toContain("index('idx_lantern_responses_lantern_id')");
    const idx = schema.indexOf('idx_lantern_responses_lantern_id');
    const after = schema.slice(idx, idx + 100);
    expect(after).toMatch(/t\.lanternId/);
  });

  // L21 — whistles household scope
  it("schema declares idx_whistles_household_ends_at_starts_at on (householdId, endsAt, startsAt)", () => {
    expect(schema).toContain("index('idx_whistles_household_ends_at_starts_at')");
    const idx = schema.indexOf('idx_whistles_household_ends_at_starts_at');
    const after = schema.slice(idx, idx + 200);
    expect(after).toMatch(/t\.householdId.*t\.endsAt.*t\.startsAt/s);
  });

  // L21 — whistles village scope (with status)
  it("schema declares idx_whistles_household_status_ends_at_starts_at on (householdId, status, endsAt, startsAt)", () => {
    expect(schema).toContain("index('idx_whistles_household_status_ends_at_starts_at')");
    const idx = schema.indexOf('idx_whistles_household_status_ends_at_starts_at');
    const after = schema.slice(idx, idx + 250);
    expect(after).toMatch(/t\.householdId.*t\.status.*t\.endsAt.*t\.startsAt/s);
  });

  // L21 — whistles mine scope (claimed)
  it("schema declares idx_whistles_claimed_by_ends_at on (claimedByUserId, endsAt)", () => {
    expect(schema).toContain("index('idx_whistles_claimed_by_ends_at')");
    const idx = schema.indexOf('idx_whistles_claimed_by_ends_at');
    const after = schema.slice(idx, idx + 150);
    expect(after).toMatch(/t\.claimedByUserId.*t\.endsAt/s);
  });

  // L21 — whistles mine scope (created)
  it("schema declares idx_whistles_created_by_ends_at on (createdByUserId, endsAt)", () => {
    expect(schema).toContain("index('idx_whistles_created_by_ends_at')");
    const idx = schema.indexOf('idx_whistles_created_by_ends_at');
    const after = schema.slice(idx, idx + 150);
    expect(after).toMatch(/t\.createdByUserId.*t\.endsAt/s);
  });

  // L21 — whistles preferred caregiver targeting
  it("schema declares idx_whistles_preferred_caregiver_status_ends_at on (preferredCaregiverId, status, endsAt)", () => {
    expect(schema).toContain("index('idx_whistles_preferred_caregiver_status_ends_at')");
    const idx = schema.indexOf('idx_whistles_preferred_caregiver_status_ends_at');
    const after = schema.slice(idx, idx + 200);
    expect(after).toMatch(/t\.preferredCaregiverId.*t\.status.*t\.endsAt/s);
  });

  // L22 — ICS cal_token partial index
  it("schema declares idx_users_cal_token as partial index WHERE cal_token IS NOT NULL", () => {
    expect(schema).toContain("index('idx_users_cal_token')");
    const idx = schema.indexOf('idx_users_cal_token');
    const after = schema.slice(idx, idx + 200);
    expect(after).toMatch(/t\.calToken/);
    expect(after).toContain('cal_token IS NOT NULL');
  });

  // Existing B4 escalation index must still be present (anchor)
  it("schema still declares idx_lanterns_status_escalated_created (B4 anchor)", () => {
    expect(schema).toContain("index('idx_lanterns_status_escalated_created')");
  });
});

describe('B7 hot-path indexes — migration file', () => {
  let sql: string;

  beforeAll(() => {
    expect(existsSync(MIGRATION_FILE), `${MIGRATION_FILE} must exist`).toBe(true);
    sql = readFileSync(MIGRATION_FILE, 'utf-8');
  });

  it('migration contains only CREATE INDEX statements (no unexpected ALTERs)', () => {
    // Each line is either a CREATE INDEX or the drizzle statement-breakpoint comment
    const lines = sql.split('\n').filter(l => l.trim().length > 0);
    for (const line of lines) {
      expect(
        line.startsWith('CREATE INDEX') || line.includes('--> statement-breakpoint'),
        `Unexpected line in migration: ${line}`
      ).toBe(true);
    }
  });

  it('migration creates idx_lantern_responses_lantern_id', () => {
    expect(sql).toContain('"idx_lantern_responses_lantern_id"');
    expect(sql).toContain('"lantern_responses"');
  });

  it('migration creates idx_lanterns_household_status_ends_at', () => {
    expect(sql).toContain('"idx_lanterns_household_status_ends_at"');
    expect(sql).toContain('"lanterns"');
  });

  it('migration creates idx_whistles_household_ends_at_starts_at', () => {
    expect(sql).toContain('"idx_whistles_household_ends_at_starts_at"');
  });

  it('migration creates idx_whistles_household_status_ends_at_starts_at', () => {
    expect(sql).toContain('"idx_whistles_household_status_ends_at_starts_at"');
  });

  it('migration creates idx_whistles_claimed_by_ends_at', () => {
    expect(sql).toContain('"idx_whistles_claimed_by_ends_at"');
  });

  it('migration creates idx_whistles_created_by_ends_at', () => {
    expect(sql).toContain('"idx_whistles_created_by_ends_at"');
  });

  it('migration creates idx_whistles_preferred_caregiver_status_ends_at', () => {
    expect(sql).toContain('"idx_whistles_preferred_caregiver_status_ends_at"');
  });

  it('migration creates idx_users_cal_token as partial index WHERE cal_token IS NOT NULL', () => {
    expect(sql).toContain('"idx_users_cal_token"');
    expect(sql).toContain('WHERE cal_token IS NOT NULL');
  });

  it('drizzle/meta/0010_snapshot.json exists', () => {
    const snapshot = path.join(META_DIR, '0010_snapshot.json');
    expect(existsSync(snapshot), `${snapshot} must exist`).toBe(true);
  });

  it('_journal.json has a 0010 entry with idx=10', () => {
    const journal = JSON.parse(readFileSync(path.join(META_DIR, '_journal.json'), 'utf-8'));
    const entries: { idx: number; tag: string; when: number }[] = journal.entries;
    const entry = entries.find(e => e.idx === 10);
    expect(entry, 'journal must have an entry with idx=10').toBeDefined();
    expect(entry!.tag).toBe(MIGRATION_TAG);

    // Monotonic when check (per 2026-04-27 journal-drift lesson)
    const entry0009 = entries.find(e => e.idx === 9)!;
    expect(entry!.when).toBeGreaterThanOrEqual(entry0009.when);
  });
});
