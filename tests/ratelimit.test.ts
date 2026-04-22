import { describe, it, expect, beforeEach } from 'vitest';
import { rateLimit } from '../lib/ratelimit';

describe('rateLimit', () => {
  // Use unique keys per test so state doesn't bleed across cases
  let keyCounter = 0;
  let key: string;
  beforeEach(() => { key = `test:${++keyCounter}`; });

  it('allows requests under the limit', () => {
    const r1 = rateLimit({ key, limit: 3, windowMs: 60_000 });
    const r2 = rateLimit({ key, limit: 3, windowMs: 60_000 });
    const r3 = rateLimit({ key, limit: 3, windowMs: 60_000 });
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    expect(r3.ok).toBe(true);
    expect(r3.remaining).toBe(0);
  });

  it('blocks the request that crosses the limit', () => {
    rateLimit({ key, limit: 2, windowMs: 60_000 });
    rateLimit({ key, limit: 2, windowMs: 60_000 });
    const over = rateLimit({ key, limit: 2, windowMs: 60_000 });
    expect(over.ok).toBe(false);
    expect(over.retryAfterMs).toBeGreaterThan(0);
  });

  it('isolates keys', () => {
    const a = rateLimit({ key: `iso:a`, limit: 1, windowMs: 60_000 });
    const aBlocked = rateLimit({ key: `iso:a`, limit: 1, windowMs: 60_000 });
    const b = rateLimit({ key: `iso:b`, limit: 1, windowMs: 60_000 });
    expect(a.ok).toBe(true);
    expect(aBlocked.ok).toBe(false);
    expect(b.ok).toBe(true);
  });

  it('resets after the window elapses', () => {
    rateLimit({ key, limit: 1, windowMs: 10 });
    const immediatelyBlocked = rateLimit({ key, limit: 1, windowMs: 10 });
    expect(immediatelyBlocked.ok).toBe(false);
    return new Promise<void>(resolve => {
      setTimeout(() => {
        const afterReset = rateLimit({ key, limit: 1, windowMs: 10 });
        expect(afterReset.ok).toBe(true);
        resolve();
      }, 20);
    });
  });
});
