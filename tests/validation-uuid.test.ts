import { describe, it, expect } from 'vitest';
import { requireUUID, UUID_RE } from '@/lib/validate/uuid';
import { readFileSync } from 'fs';
import path from 'path';

// ── Unit: requireUUID ────────────────────────────────────────────────────────

describe('requireUUID', () => {
  it('returns the string for a valid v4 UUID', () => {
    const id = '550e8400-e29b-41d4-a716-446655440000';
    expect(requireUUID(id)).toBe(id);
  });

  it('returns the string for upper-case UUID', () => {
    const id = '550E8400-E29B-41D4-A716-446655440000';
    expect(requireUUID(id)).toBe(id);
  });

  it('returns null for an empty string', () => {
    expect(requireUUID('')).toBeNull();
  });

  it('returns null for a non-UUID string', () => {
    expect(requireUUID('not-a-uuid')).toBeNull();
  });

  it('returns null for a UUID missing a segment', () => {
    expect(requireUUID('550e8400-e29b-41d4-a716')).toBeNull();
  });

  it('returns null for null input', () => {
    expect(requireUUID(null)).toBeNull();
  });

  it('returns null for numeric input', () => {
    expect(requireUUID(42)).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(requireUUID(undefined)).toBeNull();
  });
});

describe('UUID_RE', () => {
  it('matches a canonical v4 UUID', () => {
    expect(UUID_RE.test('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
  });

  it('does not match a truncated UUID', () => {
    expect(UUID_RE.test('550e8400-e29b')).toBe(false);
  });
});

// ── Source-grep: every [id] DB route validates UUID before DB access ─────────

const API_ROOT = path.join(process.cwd(), 'app/api');

function readRoute(rel: string) {
  return readFileSync(path.join(API_ROOT, rel), 'utf8');
}

// Verify each route imports requireUUID and returns 400 on bad input before DB
const UUID_ROUTES = [
  'lantern/[id]/route.ts',
  'whistles/[id]/claim/route.ts',
  'whistles/[id]/cancel/route.ts',
  'whistles/[id]/unclaim/route.ts',
  'lantern/[id]/escalate/route.ts',
  'lantern/[id]/respond/route.ts',
];

for (const rel of UUID_ROUTES) {
  describe(`UUID validation in ${rel}`, () => {
    const src = readRoute(rel);

    it('imports requireUUID', () => {
      expect(src).toMatch(/requireUUID/);
    });

    it('returns 400 { error: "invalid id" } before DB access', () => {
      // The guard pattern must appear before any db. call
      const guardIdx = src.indexOf("{ error: 'invalid id' }");
      const firstDbIdx = src.indexOf('db.');
      expect(guardIdx).toBeGreaterThan(-1);
      expect(guardIdx).toBeLessThan(firstDbIdx);
    });
  });
}
