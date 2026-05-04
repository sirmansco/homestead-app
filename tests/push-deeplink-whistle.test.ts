import { describe, it, expect, vi, beforeEach } from 'vitest';

// B7 regression: push notifications must include &whistle=<id> so the app
// can deep-link the keeper (and B8 confirmation push the watcher) to the
// specific ShiftCard. Falsifiability: removing the &whistle suffix from
// either notify call turns these red.

const { mockSelect, mockUpdate, mockPushToUser, mockSend } = vi.hoisted(() => {
  const mockSelect = vi.fn();
  const mockUpdate = vi.fn();
  const mockPushToUser = vi.fn().mockResolvedValue({ kind: 'delivered', recipients: 1, delivered: 1 });
  const mockSend = vi.fn().mockResolvedValue(undefined);
  return { mockSelect, mockUpdate, mockPushToUser, mockSend };
});

vi.mock('@/lib/db', () => ({
  db: { select: mockSelect, update: mockUpdate },
}));

vi.mock('@/lib/push', () => ({
  pushToUser: mockPushToUser,
  pushToUsers: vi.fn(),
  pushToHousehold: vi.fn(),
  pushToHouseholdCaregivers: vi.fn(),
}));

// Resend stub via global fetch — notify.ts uses fetch under the hood
// for the email send path; we don't care what it does for these tests.
beforeEach(() => {
  vi.clearAllMocks();
  mockPushToUser.mockResolvedValue({ kind: 'delivered', recipients: 1, delivered: 1 });
  mockSend.mockResolvedValue(undefined);
  // Stub fetch for the email send path inside notifyShiftClaimed.
  globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }) as unknown as typeof fetch;
});

import { notifyShiftClaimed, notifyShiftClaimedConfirmation } from '@/lib/notify';
import { getCopy } from '@/lib/copy';

const SHIFT_ID = '00000000-0000-4000-a000-000000000099';
const KEEPER_ID = '00000000-0000-4000-a000-000000000010';
const CLAIMER_ID = '00000000-0000-4000-a000-000000000011';

const startsAt = new Date('2026-05-12T18:00:00Z');
const SHIFT_ROW = {
  id: SHIFT_ID,
  title: 'Bedtime Friday',
  startsAt,
  endsAt: new Date('2026-05-12T22:00:00Z'),
  createdByUserId: KEEPER_ID,
  claimedByUserId: CLAIMER_ID,
  status: 'claimed',
  householdId: 'hh-1',
};

const HOUSEHOLD_ROW = { id: 'hh-1', name: 'Sirmans' };
const KEEPER_ROW = { id: KEEPER_ID, email: 'keeper@example.com', name: 'Keeper', notifyShiftClaimed: true };
const CLAIMER_ROW = { id: CLAIMER_ID, name: 'Karson' };

function chainResolving(rows: unknown[]) {
  const c = { from: vi.fn(), leftJoin: vi.fn(), where: vi.fn(), limit: vi.fn() };
  c.from.mockReturnValue(c);
  c.leftJoin.mockReturnValue(c);
  c.where.mockReturnValue(c);
  c.limit.mockResolvedValue(rows);
  return c;
}

describe('notifyShiftClaimed — B7 deep-link', () => {
  it('push URL includes &whistle=<shiftId> after the existing &tab=', async () => {
    // notifyShiftClaimed runs 3 selects: joined shift+household, creator, claimer.
    mockSelect
      .mockReturnValueOnce(chainResolving([{ shift: SHIFT_ROW, household: HOUSEHOLD_ROW }]))
      .mockReturnValueOnce(chainResolving([KEEPER_ROW]))
      .mockReturnValueOnce(chainResolving([CLAIMER_ROW]));

    await notifyShiftClaimed(SHIFT_ID);

    expect(mockPushToUser).toHaveBeenCalledTimes(1);
    const payload = mockPushToUser.mock.calls[0]?.[1] as { url: string };
    const t = getCopy();
    expect(payload.url).toBe(`/?tab=${t.request.deepLinkTab}&whistle=${SHIFT_ID}`);
    expect(payload.url).toMatch(/[?&]whistle=/);
  });
});

describe('notifyShiftClaimedConfirmation — B7 deep-link', () => {
  it('push URL includes &whistle=<shiftId> for the claimer push', async () => {
    mockSelect.mockReturnValueOnce(chainResolving([SHIFT_ROW]));

    await notifyShiftClaimedConfirmation(SHIFT_ID);

    expect(mockPushToUser).toHaveBeenCalledTimes(1);
    const payload = mockPushToUser.mock.calls[0]?.[1] as { url: string };
    const t = getCopy();
    expect(payload.url).toBe(`/?tab=${t.request.shiftsDeepLinkTab}&whistle=${SHIFT_ID}`);
    expect(payload.url).toMatch(/[?&]whistle=/);
  });
});

describe('client deep-link parsing — B7 source-grep falsifiability', () => {
  it('CoveyApp parses ?whistle=<uuid>, sets highlight state, and registers visibilitychange + focus listeners', async () => {
    const { readFileSync } = await import('node:fs');
    const path = await import('node:path');
    const src = readFileSync(
      path.resolve(__dirname, '..', 'app/components/CoveyApp.tsx'),
      'utf-8',
    );
    // Each of these lines is what makes the deep-link reachable.
    expect(src).toMatch(/highlightWhistleId/);
    expect(src).toMatch(/params\.get\(['"]whistle['"]\)/);
    expect(src).toMatch(/visibilitychange/);
    expect(src).toMatch(/['"]focus['"]/);
    // Auto-clear timer must exist or stale params permanently mark cards.
    expect(src).toMatch(/setHighlightWhistleId\(null\)/);
  });

  it('ScreenPerch ShiftCard accepts isHighlighted and scrolls into view', async () => {
    const { readFileSync } = await import('node:fs');
    const path = await import('node:path');
    const src = readFileSync(
      path.resolve(__dirname, '..', 'app/components/ScreenPerch.tsx'),
      'utf-8',
    );
    expect(src).toMatch(/isHighlighted/);
    expect(src).toMatch(/scrollIntoView/);
    expect(src).toMatch(/data-whistle-id/);
  });

  it('ScreenWhistles ShiftCard accepts isHighlighted and scrolls into view', async () => {
    const { readFileSync } = await import('node:fs');
    const path = await import('node:path');
    const src = readFileSync(
      path.resolve(__dirname, '..', 'app/components/ScreenWhistles.tsx'),
      'utf-8',
    );
    expect(src).toMatch(/isHighlighted/);
    expect(src).toMatch(/scrollIntoView/);
    expect(src).toMatch(/data-whistle-id/);
  });
});
