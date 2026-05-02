import { describe, it, expect } from 'vitest';
import { parseTimeRange } from '@/lib/validate/time-range';

describe('parseTimeRange', () => {
  const validStart = '2026-06-01T10:00:00.000Z';
  const validEnd   = '2026-06-01T12:00:00.000Z'; // 2h window

  it('returns starts/ends Dates on valid ISO range', () => {
    const result = parseTimeRange(validStart, validEnd);
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.starts).toBeInstanceOf(Date);
      expect(result.ends).toBeInstanceOf(Date);
      expect(+result.starts).toBe(new Date(validStart).getTime());
      expect(+result.ends).toBe(new Date(validEnd).getTime());
    }
  });

  it('rejects non-string rawStart', () => {
    const result = parseTimeRange(null, validEnd);
    expect('error' in result).toBe(true);
    if ('error' in result) expect(result.status).toBe(400);
  });

  it('rejects non-string rawEnd', () => {
    const result = parseTimeRange(validStart, undefined);
    expect('error' in result).toBe(true);
    if ('error' in result) expect(result.status).toBe(400);
  });

  it('rejects non-ISO gibberish start', () => {
    const result = parseTimeRange('not-a-date', validEnd);
    expect('error' in result).toBe(true);
    if ('error' in result) expect(result.status).toBe(400);
  });

  it('rejects non-ISO gibberish end', () => {
    const result = parseTimeRange(validStart, 'not-a-date');
    expect('error' in result).toBe(true);
    if ('error' in result) expect(result.status).toBe(400);
  });

  it('rejects inverted range (end < start)', () => {
    const result = parseTimeRange(validEnd, validStart); // swapped
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.status).toBe(400);
      expect(result.error).toMatch(/after/i);
    }
  });

  it('rejects equal start and end', () => {
    const result = parseTimeRange(validStart, validStart);
    expect('error' in result).toBe(true);
    if ('error' in result) expect(result.status).toBe(400);
  });

  it('rejects window exceeding maxWindowMs', () => {
    // 2h window, cap at 1h
    const result = parseTimeRange(validStart, validEnd, { maxWindowMs: 60 * 60 * 1000 });
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.status).toBe(400);
      expect(result.error).toMatch(/exceeds/i);
    }
  });

  it('accepts window exactly at maxWindowMs boundary', () => {
    const start = '2026-06-01T10:00:00.000Z';
    const end   = '2026-06-01T11:00:00.000Z'; // exactly 1h
    const result = parseTimeRange(start, end, { maxWindowMs: 60 * 60 * 1000 });
    expect('error' in result).toBe(false);
  });

  it('accepts 24h window for bell (86_400_000 ms cap)', () => {
    const start = '2026-06-01T00:00:00.000Z';
    const end   = '2026-06-02T00:00:00.000Z'; // exactly 24h
    const result = parseTimeRange(start, end, { maxWindowMs: 86_400_000 });
    expect('error' in result).toBe(false);
  });

  it('rejects window over 24h for bell', () => {
    const start = '2026-06-01T00:00:00.000Z';
    const end   = '2026-06-02T00:00:01.000Z'; // 24h + 1s
    const result = parseTimeRange(start, end, { maxWindowMs: 86_400_000 });
    expect('error' in result).toBe(true);
  });

  it('accepts multi-day window when no cap (shifts)', () => {
    const start = '2026-06-01T08:00:00.000Z';
    const end   = '2026-06-08T08:00:00.000Z'; // 7 days
    const result = parseTimeRange(start, end);
    expect('error' in result).toBe(false);
  });
});
