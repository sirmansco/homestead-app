import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// L16 regression: every silent-skip path in lib/notify.ts (creator opted out,
// recipient missing, empty field tier, no parents opted in, Resend missing)
// previously returned without emitting any log line. Operations could not
// distinguish intentional suppression from broken pipeline.
//
// These tests assert each early-return path emits a structured
// `notify_*_skip` log line with the expected reason. Mentally reverting any
// individual logSkip() call in lib/notify.ts must turn the corresponding
// test red.

vi.mock('@/lib/db', () => ({
  db: { select: vi.fn() },
}));

vi.mock('@/lib/push', () => ({
  pushToUser: vi.fn(),
  pushToUsers: vi.fn(),
}));

vi.mock('@/lib/copy', () => ({
  getCopy: () => ({
    brand: { name: 'Covey' },
    emails: { notify: 'notify@covey.test' },
    roles: { keeper: { singular: 'Parent' }, watcher: { singular: 'Caregiver' } },
    request: {
      newLabel: 'Request', tabLabel: 'Requests', acceptVerb: 'Accept',
      pushTitle: (n: string) => n, pushTitleTargeted: (n: string) => n,
      coveredTitle: (n: string) => n, cancelledTitle: 'Cancelled',
      releasedTitle: (n: string) => n, releasedBody: (t: string) => t,
      deepLinkTab: 'perch', shiftsDeepLinkTab: 'whistles',
      tagPrefix: 'req', claimedTagPrefix: 'claim',
      cancelTagPrefix: 'cancel', releasedTagPrefix: 'released',
    },
    urgentSignal: {
      noun: 'Lantern',
      pushTitle: (n: string) => n, pushBody: (r: string) => r,
      escalateTitle: (r: string) => r, escalateBody: 'esc',
      respondedTitles: { onWay: (n: string) => n, thirty: (n: string) => n, cannot: (n: string) => n },
      respondedBodies: { onWay: 'a', thirty: 'b', cannot: 'c' },
      deepLinkTab: 'lantern', tagPrefix: 'bell', escalateTagPrefix: 'esc',
      respondedTagPrefix: 'resp', thirtyTagPrefix: 'thirty', cannotTagPrefix: 'cannot',
    },
    circle: { title: 'Circle' },
  }),
}));

vi.mock('@/lib/format/time', () => ({
  fmtDateTime: (d: Date) => d.toISOString(),
  fmtDateShort: (d: Date) => d.toISOString().slice(0, 10),
}));

import {
  notifyShiftClaimed,
  notifyShiftReleased,
  notifyShiftCancelled,
  notifyLanternEscalated,
  notifyLanternResponse,
} from '@/lib/notify';
import { db } from '@/lib/db';
import { pushToUser, pushToUsers } from '@/lib/push';

function makeSelectStub(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  chain['from'] = () => chain;
  chain['leftJoin'] = () => chain;
  chain['where'] = () => chain;
  chain['limit'] = () => chain;
  chain['then'] = (resolve: (v: unknown) => void) => { resolve(rows); return chain; };
  chain['catch'] = () => chain;
  chain['finally'] = () => chain;
  return chain;
}

function logCallsForEvent(event: string): Record<string, unknown>[] {
  const spy = vi.mocked(console.log);
  return spy.mock.calls
    .map(call => {
      try { return JSON.parse(call[0] as string) as Record<string, unknown>; }
      catch { return null; }
    })
    .filter((p): p is Record<string, unknown> => !!p && p.event === event);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('notifyShiftClaimed — creator opted out (L16)', () => {
  it('emits notify_shift_claimed_skip with reason creator_opted_out and does not push', async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce(makeSelectStub([{
        shift: { id: 's1', claimedByUserId: 'u-claim', createdByUserId: 'u-creator', householdId: 'hh-1', title: 'X', startsAt: new Date(), endsAt: new Date() },
        household: { id: 'hh-1', name: 'Smith' },
      }]))
      .mockReturnValueOnce(makeSelectStub([{ id: 'u-creator', name: 'Parent', email: 'p@test', notifyShiftClaimed: false }]))
      .mockReturnValueOnce(makeSelectStub([{ id: 'u-claim', name: 'Claimer' }]));

    await notifyShiftClaimed('s1');

    expect(pushToUser).not.toHaveBeenCalled();
    const logs = logCallsForEvent('notify_shift_claimed_skip');
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ reason: 'creator_opted_out', shiftId: 's1', creatorId: 'u-creator' });
  });
});

describe('notifyShiftClaimed — creator email missing (L16, edge case from §3)', () => {
  it('pushes successfully then emits notify_shift_claimed_skip with reason creator_email_missing', async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce(makeSelectStub([{
        shift: { id: 's1', claimedByUserId: 'u-claim', createdByUserId: 'u-creator', householdId: 'hh-1', title: 'X', startsAt: new Date(), endsAt: new Date() },
        household: { id: 'hh-1', name: 'Smith' },
      }]))
      .mockReturnValueOnce(makeSelectStub([{ id: 'u-creator', name: 'Parent', email: null, notifyShiftClaimed: true }]))
      .mockReturnValueOnce(makeSelectStub([{ id: 'u-claim', name: 'Claimer' }]));
    vi.mocked(pushToUser).mockResolvedValueOnce({ attempted: 1, delivered: 1, stale: 0, failed: 0, errors: [] });

    await notifyShiftClaimed('s1');

    const logs = logCallsForEvent('notify_shift_claimed_skip');
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ reason: 'creator_email_missing', shiftId: 's1' });
  });
});

describe('notifyShiftReleased — creator opted out (L16)', () => {
  it('emits notify_shift_released_skip with reason creator_opted_out', async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce(makeSelectStub([{
        shift: { id: 's2', createdByUserId: 'u-creator', householdId: 'hh-1', title: 'X', startsAt: new Date(), endsAt: new Date() },
        household: { id: 'hh-1', name: 'Smith' },
      }]))
      .mockReturnValueOnce(makeSelectStub([{ id: 'u-creator', name: 'Parent', email: 'p@test', notifyShiftReleased: false }]))
      .mockReturnValueOnce(makeSelectStub([{ id: 'u-rel', name: 'Releaser' }]));

    await notifyShiftReleased('s2', 'u-rel');

    expect(pushToUser).not.toHaveBeenCalled();
    const logs = logCallsForEvent('notify_shift_released_skip');
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ reason: 'creator_opted_out', shiftId: 's2', creatorId: 'u-creator' });
  });
});

describe('notifyShiftCancelled — recipient opted out (L16)', () => {
  it('emits notify_shift_cancelled_skip with reason recipient_opted_out', async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce(makeSelectStub([{
        shift: { id: 's3', householdId: 'hh-1', title: 'X', startsAt: new Date(), endsAt: new Date() },
        household: { id: 'hh-1', name: 'Smith' },
      }]))
      .mockReturnValueOnce(makeSelectStub([{ id: 'u-rec', name: 'Recipient', email: 'r@test', notifyShiftReleased: false }]));

    await notifyShiftCancelled('s3', 'u-rec');

    expect(pushToUser).not.toHaveBeenCalled();
    const logs = logCallsForEvent('notify_shift_cancelled_skip');
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ reason: 'recipient_opted_out', shiftId: 's3', recipientUserId: 'u-rec' });
  });
});

describe('notifyLanternEscalated — empty field (L16)', () => {
  it('emits notify_lantern_escalated_skip with reason empty_field', async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce(makeSelectStub([{ id: 'l1', householdId: 'hh-1', reason: 'sick', note: null }]))
      .mockReturnValueOnce(makeSelectStub([])); // no field caregivers

    await notifyLanternEscalated('l1');

    expect(pushToUsers).not.toHaveBeenCalled();
    const logs = logCallsForEvent('notify_lantern_escalated_skip');
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ reason: 'empty_field', lanternId: 'l1', householdId: 'hh-1' });
  });
});

describe('notifyLanternResponse — no parents opted in (L16)', () => {
  it('emits notify_lantern_response_skip with reason no_parents_opted_in', async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce(makeSelectStub([{ id: 'l2', householdId: 'hh-1' }])) // lantern
      .mockReturnValueOnce(makeSelectStub([{ id: 'u-resp', name: 'Responder' }])) // responder
      .mockReturnValueOnce(makeSelectStub([{ id: 'p1', notifyLanternResponse: false }])); // parents — none opted in

    await notifyLanternResponse('l2', 'u-resp', 'on_my_way');

    expect(pushToUser).not.toHaveBeenCalled();
    const logs = logCallsForEvent('notify_lantern_response_skip');
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ reason: 'no_parents_opted_in', lanternId: 'l2', householdId: 'hh-1' });
  });
});
