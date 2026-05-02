import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

// Source-grep: verify the three guards exist in feedback/route.ts.
// Unit tests for parseTimeRange cover the shared helper; these tests confirm
// the guards are wired in the route, not just that the helper exists.

const src = readFileSync(
  path.join(process.cwd(), 'app/api/feedback/route.ts'),
  'utf8',
);

describe('feedback/route.ts — L26: Content-Length guard', () => {
  it('imports rateLimit and rateLimitResponse', () => {
    expect(src).toMatch(/rateLimit.*rateLimitResponse|rateLimitResponse.*rateLimit/);
  });

  it('reads content-length header', () => {
    expect(src).toContain('content-length');
  });

  it('returns 413 on over-size body', () => {
    expect(src).toContain('413');
    expect(src).toContain('request too large');
  });

  it('uses 16_384 byte threshold (16 KB)', () => {
    expect(src).toContain('16_384');
  });
});

describe('feedback/route.ts — L26: message length cap', () => {
  it('caps message at 4000 chars and returns 400', () => {
    expect(src).toContain('4000');
    expect(src).toContain('message too long');
  });
});

describe('feedback/route.ts — L26: rate limit', () => {
  it('rate-limits with feedback: key prefix', () => {
    expect(src).toMatch(/`feedback:\$\{user\.id\}`/);
  });

  it('uses limit 5 per 60_000 ms window', () => {
    expect(src).toContain('limit: 5');
    expect(src).toContain('60_000');
  });

  it('returns early if rate-limited', () => {
    expect(src).toContain('rateLimitResponse');
    // The guard must appear before req.json()
    const rlIdx = src.indexOf('rateLimitResponse');
    const jsonIdx = src.indexOf('req.json()');
    expect(rlIdx).toBeLessThan(jsonIdx);
  });
});
