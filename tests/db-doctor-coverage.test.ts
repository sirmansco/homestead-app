import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// L12 regression: scripts/doctor.ts must cover push_subscriptions and
// include unique constraint checks. Without this, duplicate push subscription
// rows (which fan-out bells N× per user per device) would not be caught.

const DOCTOR_SRC = readFileSync(join(__dirname, '..', 'scripts', 'doctor.ts'), 'utf8');

describe('L12 — doctor.ts coverage', () => {
  it('covers push_subscriptions table in EXPECTED_COLUMNS', () => {
    expect(DOCTOR_SRC).toContain("push_subscriptions:");
    expect(DOCTOR_SRC).toContain("'endpoint'");
  });

  it('includes unique constraint check logic', () => {
    expect(DOCTOR_SRC).toContain('EXPECTED_UNIQUE_CONSTRAINTS');
    expect(DOCTOR_SRC).toContain("constraint-missing");
  });

  it('checks (user_id, endpoint) uniqueness on push_subscriptions', () => {
    expect(DOCTOR_SRC).toContain("push_subscriptions");
    expect(DOCTOR_SRC).toContain("['user_id', 'endpoint']");
  });

  it('checks (clerk_user_id, household_id) uniqueness on users', () => {
    expect(DOCTOR_SRC).toContain("['clerk_user_id', 'household_id']");
  });
});
