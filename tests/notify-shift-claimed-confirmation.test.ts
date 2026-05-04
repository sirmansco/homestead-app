import { describe, it, expect, vi, beforeEach } from 'vitest';

// B8 regression: notifyShiftClaimedConfirmation must push to the claimer
// (not the keeper) with watcher-perspective copy. Falsifiability: changing
// the recipient to row.shift.createdByUserId or removing the pushToUser call
// turns these red.

const { mockSelect, mockPushToUser } = vi.hoisted(() => {
  const mockSelect = vi.fn();
  const mockPushToUser = vi.fn().mockResolvedValue({ kind: 'delivered', recipients: 1, delivered: 1 });
  return { mockSelect, mockPushToUser };
});

vi.mock('@/lib/db', () => ({
  db: { select: mockSelect },
}));

vi.mock('@/lib/push', () => ({
  pushToUser: mockPushToUser,
  pushToUsers: vi.fn(),
  pushToHousehold: vi.fn(),
  pushToHouseholdCaregivers: vi.fn(),
}));

import { notifyShiftClaimedConfirmation } from '@/lib/notify';
import { getCopy } from '@/lib/copy';

const SHIFT_ID = '00000000-0000-4000-a000-000000000001';
const KEEPER_ID = '00000000-0000-4000-a000-000000000010';
const CLAIMER_ID = '00000000-0000-4000-a000-000000000011';

const startsAt = new Date('2026-05-10T18:00:00Z');
const SHIFT_ROW = {
  id: SHIFT_ID,
  title: 'Bedtime Tuesday',
  startsAt,
  endsAt: new Date('2026-05-10T22:00:00Z'),
  createdByUserId: KEEPER_ID,
  claimedByUserId: CLAIMER_ID,
  status: 'claimed',
};

function chainResolving(rows: unknown[]) {
  const c = { from: vi.fn(), where: vi.fn(), limit: vi.fn() };
  c.from.mockReturnValue(c);
  c.where.mockReturnValue(c);
  c.limit.mockResolvedValue(rows);
  return c;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPushToUser.mockResolvedValue({ kind: 'delivered', recipients: 1, delivered: 1 });
});

describe('notifyShiftClaimedConfirmation — B8', () => {
  it('pushes to the claimer (claimedByUserId), not the creator', async () => {
    mockSelect.mockReturnValueOnce(chainResolving([SHIFT_ROW]));

    await notifyShiftClaimedConfirmation(SHIFT_ID);

    expect(mockPushToUser).toHaveBeenCalledTimes(1);
    expect(mockPushToUser.mock.calls[0]?.[0]).toBe(CLAIMER_ID);
    expect(mockPushToUser.mock.calls[0]?.[0]).not.toBe(KEEPER_ID);
  });

  it('uses claimerConfirmTitle / claimerConfirmTagPrefix copy keys', async () => {
    mockSelect.mockReturnValueOnce(chainResolving([SHIFT_ROW]));

    await notifyShiftClaimedConfirmation(SHIFT_ID);

    const t = getCopy();
    const payload = mockPushToUser.mock.calls[0]?.[1] as Record<string, string>;
    expect(payload.title).toBe(t.request.claimerConfirmTitle(SHIFT_ROW.title));
    expect(payload.tag).toBe(`${t.request.claimerConfirmTagPrefix}-${SHIFT_ID}`);
    expect(payload.url).toBe(`/?tab=${t.request.shiftsDeepLinkTab}`);
  });

  it('skips silently when shift row missing', async () => {
    mockSelect.mockReturnValueOnce(chainResolving([]));
    await notifyShiftClaimedConfirmation(SHIFT_ID);
    expect(mockPushToUser).not.toHaveBeenCalled();
  });

  it('skips when claimedByUserId is null (race-safety)', async () => {
    mockSelect.mockReturnValueOnce(chainResolving([{ ...SHIFT_ROW, claimedByUserId: null }]));
    await notifyShiftClaimedConfirmation(SHIFT_ID);
    expect(mockPushToUser).not.toHaveBeenCalled();
  });

  it('swallows pushToUser failures (fire-and-forget — does not throw)', async () => {
    mockSelect.mockReturnValueOnce(chainResolving([SHIFT_ROW]));
    mockPushToUser.mockRejectedValueOnce(new Error('VAPID exploded'));

    await expect(notifyShiftClaimedConfirmation(SHIFT_ID)).resolves.toBeUndefined();
  });
});

describe('claim route — B8 wiring', () => {
  it('route source imports notifyShiftClaimedConfirmation and calls it after the keeper notify', async () => {
    const { readFileSync } = await import('node:fs');
    const path = await import('node:path');
    const src = readFileSync(
      path.resolve(__dirname, '..', 'app/api/whistles/[id]/claim/route.ts'),
      'utf-8',
    );
    // Falsifiability: deleting the import or the call below turns these red.
    expect(src).toMatch(/import\s+\{\s*[^}]*notifyShiftClaimedConfirmation[^}]*\}\s+from\s+['"]@\/lib\/notify['"]/);
    expect(src).toMatch(/notifyShiftClaimedConfirmation\(claimed\.id\)/);

    // Order check: keeper notify must come before claimer confirm so the
    // independent try/catch ordering matches the comment.
    const keeperIdx = src.indexOf('notifyShiftClaimed(claimed.id)');
    const confirmIdx = src.indexOf('notifyShiftClaimedConfirmation(claimed.id)');
    expect(keeperIdx).toBeGreaterThan(0);
    expect(confirmIdx).toBeGreaterThan(keeperIdx);
  });
});
