// Item 1 (membership: The Covey rename) — Source-level guard: keepers must
// stay excluded from every whistle pickup-eligibility path and every
// shift-posted notification recipient query.
//
// Behavioral tests already cover the route-level role gate
// (auth-access-shift-claim.test.ts, "returns 403 when caller is a parent").
// This grep-style guard catches a different class of regression: someone
// rewriting the recipient query in lib/notify.ts to drop the
// `eq(users.role, 'watcher')` filter, which would silently send shift-
// posted pushes to keepers without flipping any existing test red.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const NOTIFY_PATH = resolve(__dirname, '../lib/notify.ts');
const CLAIM_PATH = resolve(__dirname, '../app/api/whistles/[id]/claim/route.ts');

describe('Item 1 — keeper exclusion source guards', () => {
  it('notifyNewShift broadcast recipient query filters role = watcher', () => {
    const src = readFileSync(NOTIFY_PATH, 'utf8');
    // The broadcast branch (no preferredCaregiverId) is the load-bearing
    // recipient query. It must AND on users.role = 'watcher' so a keeper
    // with notifyShiftPosted=true and villageGroup=covey is not pulled in.
    expect(src).toMatch(/notifyNewShift[\s\S]*?eq\(\s*users\.role\s*,\s*['"]watcher['"]\s*\)/);
  });

  it('notifyLanternLit eligible-pool query filters role = watcher', () => {
    const src = readFileSync(NOTIFY_PATH, 'utf8');
    expect(src).toMatch(/notifyLanternLit[\s\S]*?eq\(\s*users\.role\s*,\s*['"]watcher['"]\s*\)/);
  });

  it('notifyLanternEscalated escalated-pool query filters role = watcher', () => {
    const src = readFileSync(NOTIFY_PATH, 'utf8');
    expect(src).toMatch(/notifyLanternEscalated[\s\S]*?eq\(\s*users\.role\s*,\s*['"]watcher['"]\s*\)/);
  });

  it('claim route 403s any non-watcher caller', () => {
    const src = readFileSync(CLAIM_PATH, 'utf8');
    // Load-bearing role gate: keeper.role !== 'watcher' → 403.
    expect(src).toMatch(/claimer\.role\s*!==\s*['"]watcher['"]/);
    expect(src).toMatch(/status:\s*403/);
  });
});
