import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

// L18 migration source-grep assertions. No DB required — asserts on file
// content per the migrations-snapshot.test.ts precedent. Falsifiability:
// rename drizzle/meta/0008_snapshot.json → test 3 goes red; remove the
// 0008 journal entry → test 5 goes red.

const DRIZZLE_DIR = path.resolve(__dirname, '..', 'drizzle');
const META_DIR = path.join(DRIZZLE_DIR, 'meta');

describe('push subscription dedup + unique constraint migrations', () => {
  it('0008_dedup_push_subscriptions.sql exists and contains DELETE FROM push_subscriptions with MAX(created_at) keep-clause', () => {
    const file = path.join(DRIZZLE_DIR, '0008_dedup_push_subscriptions.sql');
    expect(existsSync(file), `${file} must exist`).toBe(true);
    const sql = readFileSync(file, 'utf-8');
    expect(sql).toContain('DELETE FROM "push_subscriptions"');
    // Keep-clause: rows with smaller created_at are deleted; tiebreak on id
    expect(sql).toMatch(/t1\.created_at\s*<\s*t2\.created_at/);
    expect(sql).toMatch(/t1\.id\s*<\s*t2\.id/);
  });

  it('0009_push_subscriptions_unique_user_endpoint.sql exists and contains ADD CONSTRAINT UNIQUE(user_id, endpoint)', () => {
    const file = path.join(DRIZZLE_DIR, '0009_push_subscriptions_unique_user_endpoint.sql');
    expect(existsSync(file), `${file} must exist`).toBe(true);
    const sql = readFileSync(file, 'utf-8');
    expect(sql).toContain('ADD CONSTRAINT "push_subscriptions_user_endpoint_unique" UNIQUE');
    expect(sql).toContain('"user_id"');
    expect(sql).toContain('"endpoint"');
  });

  it('drizzle/meta/0008_snapshot.json exists', () => {
    const file = path.join(META_DIR, '0008_snapshot.json');
    expect(existsSync(file), `${file} must exist`).toBe(true);
  });

  it('drizzle/meta/0009_snapshot.json exists', () => {
    const file = path.join(META_DIR, '0009_snapshot.json');
    expect(existsSync(file), `${file} must exist`).toBe(true);
  });

  it('_journal.json has entries for both 0008 and 0009 with monotonic when timestamps', () => {
    const journal = JSON.parse(readFileSync(path.join(META_DIR, '_journal.json'), 'utf-8'));
    const entries: { idx: number; tag: string; when: number }[] = journal.entries;

    const entry0008 = entries.find(e => e.tag === '0008_dedup_push_subscriptions');
    const entry0009 = entries.find(e => e.tag === '0009_push_subscriptions_unique_user_endpoint');

    expect(entry0008, 'journal must have 0008_dedup_push_subscriptions entry').toBeDefined();
    expect(entry0009, 'journal must have 0009_push_subscriptions_unique_user_endpoint entry').toBeDefined();

    expect(entry0008!.idx).toBe(8);
    expect(entry0009!.idx).toBe(9);

    // Monotonic when (per 2026-04-27 journal-drift lesson)
    const entry0007 = entries.find(e => e.idx === 7)!;
    expect(entry0008!.when).toBeGreaterThanOrEqual(entry0007.when);
    expect(entry0009!.when).toBeGreaterThanOrEqual(entry0008!.when);
  });
});
