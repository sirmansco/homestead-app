import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

// Source-grep: confirm rate-limit wiring in circle/invite-family/route.ts.

const src = readFileSync(
  path.join(process.cwd(), 'app/api/circle/invite-family/route.ts'),
  'utf8',
);

const acceptSrc = readFileSync(
  path.join(process.cwd(), 'app/api/circle/invite-family/accept/route.ts'),
  'utf8',
);

describe('circle/invite-family/route.ts — L25: rate limit', () => {
  it('imports rateLimit and rateLimitResponse', () => {
    expect(src).toMatch(/rateLimit.*rateLimitResponse|rateLimitResponse.*rateLimit/);
  });

  it('uses invite-family: key prefix', () => {
    expect(src).toMatch(/`invite-family:\$\{user(?:Id|\.id)\}`/);
  });

  it('uses limit 5 per 60_000 ms window', () => {
    expect(src).toContain('limit: 5');
    expect(src).toContain('60_000');
  });

  it('rate limit fires after auth, before body parse', () => {
    const rlIdx = src.indexOf('rateLimitResponse');
    const jsonIdx = src.indexOf('req.json()');
    const authIdx = src.indexOf('requireHousehold');
    // auth resolves before rate-limit check
    expect(authIdx).toBeLessThan(rlIdx);
    // rate-limit fires before body parse
    expect(rlIdx).toBeLessThan(jsonIdx);
  });
});

describe('circle/invite-family/accept/route.ts — rate limit (ship-blocker #11)', () => {
  it('imports rateLimit and rateLimitResponse', () => {
    expect(acceptSrc).toMatch(/import\s*\{[^}]*rateLimit[^}]*rateLimitResponse[^}]*\}\s*from\s*'@\/lib\/ratelimit'|import\s*\{[^}]*rateLimitResponse[^}]*rateLimit[^}]*\}\s*from\s*'@\/lib\/ratelimit'/);
  });

  it('GET uses per-IP preview key with limit 30 / 60_000 ms', () => {
    expect(acceptSrc).toMatch(/`invite-family-accept-preview:\$\{ip\}`/);
    expect(acceptSrc).toContain('limit: 30');
  });

  it('POST uses per-IP key with limit 20 / 60_000 ms', () => {
    expect(acceptSrc).toMatch(/`invite-family-accept-post:\$\{ip\}`/);
    expect(acceptSrc).toContain('limit: 20');
  });

  it('POST uses per-token key with limit 5 / 60_000 ms', () => {
    expect(acceptSrc).toMatch(/`invite-family-accept-token:\$\{token\}`/);
    // limit: 5 also appears in invite-family/route.ts but here we validate
    // the per-token key string is present alongside limit: 5 in this file.
    expect(acceptSrc).toContain('limit: 5');
  });

  it('uses 60_000 ms window for all accept-route limiters', () => {
    // All three rate-limit blocks share the 60s window.
    const matches = acceptSrc.match(/windowMs:\s*60_000/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(3);
  });

  it('GET rate limit fires before DB select', () => {
    const getIdx = acceptSrc.indexOf('export async function GET');
    const postIdx = acceptSrc.indexOf('export async function POST');
    const getBlock = acceptSrc.slice(getIdx, postIdx);
    const rlIdx = getBlock.indexOf('rateLimitResponse');
    const dbIdx = getBlock.indexOf('await db');
    expect(rlIdx).toBeGreaterThan(-1);
    expect(dbIdx).toBeGreaterThan(-1);
    expect(rlIdx).toBeLessThan(dbIdx);
  });

  it('POST rate limit fires after requireUser and before DB select', () => {
    const postIdx = acceptSrc.indexOf('export async function POST');
    const postBlock = acceptSrc.slice(postIdx);
    const authIdx = postBlock.indexOf('requireUser');
    const rlIpIdx = postBlock.indexOf('invite-family-accept-post');
    const rlTokIdx = postBlock.indexOf('invite-family-accept-token');
    const dbIdx = postBlock.indexOf('await db');
    expect(authIdx).toBeGreaterThan(-1);
    expect(rlIpIdx).toBeGreaterThan(-1);
    expect(rlTokIdx).toBeGreaterThan(-1);
    expect(dbIdx).toBeGreaterThan(-1);
    expect(authIdx).toBeLessThan(rlIpIdx);
    expect(rlIpIdx).toBeLessThan(rlTokIdx);
    expect(rlTokIdx).toBeLessThan(dbIdx);
  });

  it('derives client IP from x-forwarded-for header', () => {
    expect(acceptSrc).toMatch(/x-forwarded-for/);
    expect(acceptSrc).toMatch(/function\s+clientIp/);
  });
});
