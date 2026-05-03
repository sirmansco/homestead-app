import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

// Source-grep: confirm rate-limit wiring in circle/invite-family/route.ts.

const src = readFileSync(
  path.join(process.cwd(), 'app/api/circle/invite-family/route.ts'),
  'utf8',
);

describe('circle/invite-family/route.ts — L25: rate limit', () => {
  it('imports rateLimit and rateLimitResponse', () => {
    expect(src).toMatch(/rateLimit.*rateLimitResponse|rateLimitResponse.*rateLimit/);
  });

  it('uses invite-family: key prefix', () => {
    expect(src).toMatch(/`invite-family:\$\{userId\}`/);
  });

  it('uses limit 5 per 60_000 ms window', () => {
    expect(src).toContain('limit: 5');
    expect(src).toContain('60_000');
  });

  it('rate limit fires after auth, before body parse', () => {
    const rlIdx = src.indexOf('rateLimitResponse');
    const jsonIdx = src.indexOf('req.json()');
    const authIdx = src.indexOf('requireUser');
    // auth resolves before rate-limit check
    expect(authIdx).toBeLessThan(rlIdx);
    // rate-limit fires before body parse
    expect(rlIdx).toBeLessThan(jsonIdx);
  });
});
