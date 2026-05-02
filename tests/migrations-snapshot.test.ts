import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const DRIZZLE_DIR = path.resolve(__dirname, '..', 'drizzle');
const META_DIR = path.join(DRIZZLE_DIR, 'meta');

function listSqlTags(): string[] {
  return readdirSync(DRIZZLE_DIR)
    .filter(f => f.endsWith('.sql') && !f.startsWith('._'))
    .map(f => f.replace(/\.sql$/, ''))
    .sort();
}

function listSnapshotPrefixes(): string[] {
  return readdirSync(META_DIR)
    .filter(f => f.endsWith('_snapshot.json') && !f.startsWith('._'))
    .map(f => f.replace(/_snapshot\.json$/, ''))
    .sort();
}

function loadSnapshot(prefix: string) {
  return JSON.parse(readFileSync(path.join(META_DIR, `${prefix}_snapshot.json`), 'utf-8'));
}

describe('migrations / snapshot chain', () => {
  it('every drizzle/<tag>.sql has a matching meta/<idx>_snapshot.json', () => {
    const sqlTags = listSqlTags();
    const snapshotPrefixes = new Set(listSnapshotPrefixes());

    const missing = sqlTags
      .map(tag => ({ tag, prefix: tag.match(/^(\d+)_/)?.[1] }))
      .filter(({ prefix }) => prefix && !snapshotPrefixes.has(prefix))
      .map(({ tag }) => tag);

    expect(missing).toEqual([]);
  });

  it('prevId chain resolves: every snapshot points at an existing snapshot id (or the zero-uuid)', () => {
    const ZERO = '00000000-0000-0000-0000-000000000000';
    const prefixes = listSnapshotPrefixes();
    const ids = new Set(prefixes.map(p => loadSnapshot(p).id));

    const orphans: string[] = [];
    for (const prefix of prefixes) {
      const snap = loadSnapshot(prefix);
      if (snap.prevId !== ZERO && !ids.has(snap.prevId)) {
        orphans.push(`${prefix}_snapshot.json (prevId=${snap.prevId})`);
      }
    }

    expect(orphans).toEqual([]);
  });

  it('chain is linear: no two snapshots share a prevId', () => {
    const prefixes = listSnapshotPrefixes();
    const seen = new Map<string, string>();
    const collisions: string[] = [];

    for (const prefix of prefixes) {
      const snap = loadSnapshot(prefix);
      if (seen.has(snap.prevId)) {
        collisions.push(`${prefix} and ${seen.get(snap.prevId)} both have prevId=${snap.prevId}`);
      } else {
        seen.set(snap.prevId, prefix);
      }
    }

    expect(collisions).toEqual([]);
  });

  it('0001 snapshot reflects the post-0001 state (notify_* columns added to users)', () => {
    const snap = loadSnapshot('0001');
    const userCols = snap.tables['public.users'].columns;
    expect(userCols.notify_shift_posted).toBeDefined();
    expect(userCols.notify_shift_claimed).toBeDefined();
    expect(userCols.notify_shift_released).toBeDefined();
    expect(userCols.notify_bell_ringing).toBeDefined();
    expect(userCols.notify_bell_response).toBeDefined();
    // 0001 predates 0002's enum reduction — village_group should still be the v0 enum default
    expect(userCols.village_group.default).toBe("'inner'");
  });

  it('0004 snapshot reflects the post-0004 state (covey + field added to village_group enum)', () => {
    const snap = loadSnapshot('0004');
    expect(snap.enums['public.village_group'].values).toEqual(['inner_circle', 'sitter', 'covey', 'field']);
    // Default is still inner_circle — that was 0002's setting; 0006 changes it to covey
    expect(snap.tables['public.users'].columns.village_group.default).toBe("'inner_circle'");
  });

  it('0006 snapshot reflects the post-0006 state (village_group default flipped to covey)', () => {
    const snap = loadSnapshot('0006');
    expect(snap.tables['public.users'].columns.village_group.default).toBe("'covey'");
    expect(snap.tables['public.family_invites'].columns.village_group.default).toBe("'covey'");
  });
});
