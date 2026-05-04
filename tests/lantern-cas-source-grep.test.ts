// B1 — Source-level guard: the CAS WHERE clauses must remain in the route
// source. Behavioral tests (lantern-respond-cas, lantern-patch-cas) validate
// the route's reaction to empty .returning() rows, but the mock dictates the
// row count, so removing the WHERE clause would not flip those tests red.
// This grep-style test catches that regression: if the status='ringing' /
// handled_by_user_id IS NULL guards are removed from the SQL, the test goes
// red and the loss of atomicity is detected.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const RESPOND_PATH = resolve(__dirname, '../app/api/lantern/[id]/respond/route.ts');
const PATCH_PATH   = resolve(__dirname, '../app/api/lantern/[id]/route.ts');

describe('B1 — CAS source guards', () => {
  it('respond route claims via WHERE status=ringing AND handled_by_user_id IS NULL', () => {
    const src = readFileSync(RESPOND_PATH, 'utf8');
    expect(src).toMatch(/eq\(\s*lanterns\.status\s*,\s*['"]ringing['"]\s*\)/);
    expect(src).toMatch(/isNull\(\s*lanterns\.handledByUserId\s*\)/);
    // Must call .returning() so the route can detect zero-row CAS losses.
    expect(src).toMatch(/\.returning\(/);
  });

  it('PATCH route gates cancel/handle via WHERE status=ringing', () => {
    const src = readFileSync(PATCH_PATH, 'utf8');
    expect(src).toMatch(/eq\(\s*lanterns\.status\s*,\s*['"]ringing['"]\s*\)/);
    expect(src).toMatch(/\.returning\(/);
    // 409 path must exist — silent overwrite of a terminal state is the bug
    // this CAS prevents.
    expect(src).toMatch(/status:\s*409/);
  });
});
