import { describe, it, expect } from 'vitest';
import { filterOpenWhistles, filterClaimedWhistles } from '../app/components/ScreenWhistles';
import type { ShiftRow } from '../app/context/AppDataContext';

const NOW = new Date('2026-05-06T12:00:00Z');
const FUTURE_START = '2026-05-06T18:00:00Z';
const FUTURE_END = '2026-05-06T22:00:00Z';
const PAST_START = '2026-05-05T08:00:00Z';
const PAST_END = '2026-05-05T12:00:00Z';

function row(overrides: {
  id?: string;
  status?: ShiftRow['shift']['status'];
  claimedByMe?: boolean;
  startsAt?: string;
  endsAt?: string;
  claimedByUserId?: string | null;
}): ShiftRow {
  return {
    shift: {
      id: overrides.id ?? 'shift-1',
      title: 'Test shift',
      forWhom: null,
      notes: null,
      startsAt: overrides.startsAt ?? FUTURE_START,
      endsAt: overrides.endsAt ?? FUTURE_END,
      rateCents: null,
      status: overrides.status ?? 'open',
      householdId: 'h1',
      claimedByUserId: overrides.claimedByUserId ?? null,
      preferredCaregiverId: null,
      releasedAt: null,
    },
    household: null,
    creator: null,
    claimer: null,
    claimedByMe: overrides.claimedByMe ?? false,
  };
}

describe('filterOpenWhistles', () => {
  it('includes future open whistles not claimed by me', () => {
    const rows = [row({ id: 'a', status: 'open', claimedByMe: false })];
    expect(filterOpenWhistles(rows, NOW).map(r => r.shift.id)).toEqual(['a']);
  });

  it('excludes whistles already claimed by me', () => {
    const rows = [row({ id: 'a', status: 'open', claimedByMe: true })];
    expect(filterOpenWhistles(rows, NOW)).toEqual([]);
  });

  it('excludes claimed whistles', () => {
    const rows = [row({ id: 'a', status: 'claimed', claimedByMe: false })];
    expect(filterOpenWhistles(rows, NOW)).toEqual([]);
  });

  it('excludes done whistles', () => {
    const rows = [row({ id: 'a', status: 'done', claimedByMe: false })];
    expect(filterOpenWhistles(rows, NOW)).toEqual([]);
  });

  it('excludes cancelled whistles', () => {
    const rows = [row({ id: 'a', status: 'cancelled', claimedByMe: false })];
    expect(filterOpenWhistles(rows, NOW)).toEqual([]);
  });

  it('excludes whistles whose endsAt is in the past', () => {
    const rows = [row({ id: 'a', status: 'open', startsAt: PAST_START, endsAt: PAST_END })];
    expect(filterOpenWhistles(rows, NOW)).toEqual([]);
  });

  it('keeps a whistle whose endsAt is exactly now (boundary)', () => {
    const rows = [row({ id: 'a', status: 'open', endsAt: NOW.toISOString() })];
    expect(filterOpenWhistles(rows, NOW).map(r => r.shift.id)).toEqual(['a']);
  });
});

describe('filterClaimedWhistles', () => {
  it('includes future whistles claimed by me', () => {
    const rows = [row({ id: 'a', status: 'claimed', claimedByMe: true })];
    expect(filterClaimedWhistles(rows, NOW).map(r => r.shift.id)).toEqual(['a']);
  });

  it('excludes whistles claimed by someone else', () => {
    const rows = [row({ id: 'a', status: 'claimed', claimedByMe: false, claimedByUserId: 'other' })];
    expect(filterClaimedWhistles(rows, NOW)).toEqual([]);
  });

  it('excludes open whistles I have not claimed', () => {
    const rows = [row({ id: 'a', status: 'open', claimedByMe: false })];
    expect(filterClaimedWhistles(rows, NOW)).toEqual([]);
  });

  it('excludes done whistles even if previously claimed by me', () => {
    const rows = [row({ id: 'a', status: 'done', claimedByMe: true })];
    expect(filterClaimedWhistles(rows, NOW)).toEqual([]);
  });

  it('excludes cancelled whistles', () => {
    const rows = [row({ id: 'a', status: 'cancelled', claimedByMe: true })];
    expect(filterClaimedWhistles(rows, NOW)).toEqual([]);
  });

  it('excludes claimed whistles whose endsAt is in the past', () => {
    const rows = [row({ id: 'a', status: 'claimed', claimedByMe: true, startsAt: PAST_START, endsAt: PAST_END })];
    expect(filterClaimedWhistles(rows, NOW)).toEqual([]);
  });
});

describe('Open and Claimed are disjoint', () => {
  it('a single whistle never satisfies both filters', () => {
    const variants: ShiftRow[] = [
      row({ id: 'a', status: 'open', claimedByMe: false }),
      row({ id: 'b', status: 'open', claimedByMe: true }),
      row({ id: 'c', status: 'claimed', claimedByMe: false }),
      row({ id: 'd', status: 'claimed', claimedByMe: true }),
      row({ id: 'e', status: 'done', claimedByMe: true }),
      row({ id: 'f', status: 'cancelled', claimedByMe: false }),
    ];
    for (const r of variants) {
      const inOpen = filterOpenWhistles([r], NOW).length === 1;
      const inClaimed = filterClaimedWhistles([r], NOW).length === 1;
      expect(inOpen && inClaimed).toBe(false);
    }
  });
});
