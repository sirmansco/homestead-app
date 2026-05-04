import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

// Source-grep: confirm whistles POST debits the true row count against the
// rate-limit bucket. Audit ship-blocker #8 — without this, a recurrence
// producing 52 rows consumed 1 token, letting 20 calls churn 1,040 rows.

const src = readFileSync(
  path.join(process.cwd(), 'app/api/whistles/route.ts'),
  'utf8',
);

describe('whistles/route.ts POST — recurrence rate-limit linkage', () => {
  it('imports rateLimit and rateLimitResponse', () => {
    expect(src).toMatch(/rateLimit.*rateLimitResponse|rateLimitResponse.*rateLimit/);
  });

  it('uses shift-post: key prefix scoped to user.id', () => {
    expect(src).toMatch(/`shift-post:\$\{user\.id\}`/);
  });

  it('debits cost: valuesList.length, not a fixed value', () => {
    expect(src).toMatch(/cost:\s*valuesList\.length/);
  });

  it('uses limit 100 per 60-minute window (covers 1 yearly weekly recurrence + margin)', () => {
    expect(src).toContain('limit: 100');
    expect(src).toContain('60 * 60_000');
  });

  it('rate-limit fires after valuesList is built (true cost known) and before insert', () => {
    const valuesListBuiltIdx = src.lastIndexOf('valuesList.push');
    const rlCallIdx = src.indexOf('rateLimitResponse(rl)');
    const insertIdx = src.indexOf('db.insert(whistles)');
    expect(valuesListBuiltIdx).toBeLessThan(rlCallIdx);
    expect(rlCallIdx).toBeLessThan(insertIdx);
  });

  it('rate-limit fires after auth (requireHousehold)', () => {
    const authIdx = src.indexOf('requireHousehold');
    const rlCallIdx = src.indexOf('rateLimitResponse(rl)');
    expect(authIdx).toBeLessThan(rlCallIdx);
  });
});
