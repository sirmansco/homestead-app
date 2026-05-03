import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// Regression: ScreenPerch was passing onClaim to ShiftCard for pure-keeper users
// via the guard `role === 'watcher' || !r.createdByMe`. The `!r.createdByMe`
// escape let a keeper see a Cover button on any shift they didn't personally post
// (e.g., co-keeper's shift, or any shift where createdByMe was false).
// A keeper should never see a Cover button on their own household's shifts.
// Fix: guard is now simply `role === 'watcher'`.

const PERCH = join(__dirname, '..', 'app', 'components', 'ScreenPerch.tsx');

describe('ScreenPerch — keeper never gets a Cover button on own-household shifts', () => {
  const src = readFileSync(PERCH, 'utf8');

  it('does not pass onClaim via a !createdByMe escape for parents', () => {
    // The old offending pattern: the || !r.createdByMe bypass
    const offending = /role\s*===\s*['"]watcher['"]\s*\|\|\s*!r\.createdByMe/;
    expect(
      offending.test(src),
      'Found the old `role === "watcher" || !r.createdByMe` onClaim guard. ' +
      'This lets keepers see a Cover button on shifts they did not create. ' +
      'The guard must be simply `role === "watcher"`.'
    ).toBe(false);
  });

  it('does not pass canClaim via a !createdByMe escape in ShiftDetailSheet', () => {
    const offendingDetail = /canClaim=\{[^}]*!openRow\.createdByMe/;
    expect(
      offendingDetail.test(src),
      'Found `!openRow.createdByMe` in canClaim for ShiftDetailSheet. ' +
      'Parents must not see a Cover button in the detail sheet for own-household shifts.'
    ).toBe(false);
  });

  it('all onClaim guards for own-household sections use role === caregiver only', () => {
    // Count occurrences of the correct guard pattern in the four own-shift sections
    const correct = /onClaim=\{r\.shift\.status\s*===\s*['"]open['"]\s*&&\s*role\s*===\s*['"]watcher['"]\s*\?/g;
    const matches = src.match(correct) ?? [];
    expect(
      matches.length,
      'Expected exactly 4 onClaim guards of the form ' +
      '`r.shift.status === "open" && role === "watcher" ?` (today/tomorrow/week/later). ' +
      `Found ${matches.length}.`
    ).toBe(4);
  });
});
