import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// BUG-A regression: the active-lantern card on ScreenPerch was previously
// gated by `role === 'keeper' && activeBell`, so watchers never saw an
// active Bell on the Almanac/"Open Whistles" tab. The cancel action remains
// keeper-only (server PATCH /api/lantern/:id is gated server-side), but the card
// itself must render for any role when activeBell is non-null.
//
// We verify this at the source level (no RTL set up in this project — see
// notify-isolation.test.ts for the same pattern).

const APP_ROOT = join(__dirname, '..');
const ALMANAC = join(APP_ROOT, 'app', 'components', 'ScreenPerch.tsx');

describe('Lantern card visibility on Almanac (BUG-A)', () => {
  const src = readFileSync(ALMANAC, 'utf8');

  it('does not gate the LanternCard on role === "keeper"', () => {
    // The previous bug was a JSX guard like `{role === 'keeper' && activeBell && (`
    // wrapping <LanternCard ...>. Make sure that pattern is gone.
    const offendingPattern = /role\s*===\s*['"]keeper['"]\s*&&\s*activeBell\s*&&\s*\(\s*<LanternCard/;
    expect(
      offendingPattern.test(src),
      'ScreenPerch re-introduced the role==="keeper" gate around <LanternCard>. ' +
      'Watchers must see the active-lantern card too. Cancel action stays keeper-only.'
    ).toBe(false);
  });

  it('renders LanternCard whenever activeBell is non-null (any role)', () => {
    // Looser positive check: there must exist a guard of the shape
    // `{activeBell && (` immediately preceding <LanternCard>, with no
    // role check in between.
    const positivePattern = /\{\s*activeBell\s*&&\s*\(\s*\n[\s\S]{0,80}<LanternCard/;
    expect(
      positivePattern.test(src),
      'Could not find an unconditional `activeBell && <LanternCard>` render guard. ' +
      'If the JSX has been refactored, update this regression test to match.'
    ).toBe(true);
  });

  it('only passes onCancel when role === "keeper"', () => {
    // Cancel must remain keeper-only at the prop layer too — watchers should
    // never see a Cancel button for a Bell they cannot cancel.
    const guardedOnCancel = /onCancel=\{role\s*===\s*['"]keeper['"]\s*\?/;
    expect(
      guardedOnCancel.test(src),
      'Lantern onCancel must be guarded by `role === "keeper" ? ... : undefined` so ' +
      'watchers do not see a Cancel button for a Bell they cannot cancel.'
    ).toBe(true);
  });
});
