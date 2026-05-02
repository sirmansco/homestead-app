import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// L13 + L16 regression: notifyBellRing and notifyNewShift previously returned
// `{ sent: recipients.length, eligible: recipients.length }` regardless of
// whether pushToUsers actually delivered anything — vapid_not_configured,
// zero subscribers, partial failure all collapsed to "sent = recipients."
// They now return a discriminated NotifyResult and emit a structured
// `notify_*_skip` log line on every silent-skip path.
//
// These tests spy on the actual gates (the returned `kind` value AND the
// console.log call site for skip logs) per the 2026-05-02 "spy on the gate"
// lesson. Mentally reverting either fix in lib/notify.ts must turn these red.

// ── Mocks must be declared before the module under test is imported ──────────

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
      pushTitle: (n: string) => `New request for ${n}`,
      pushTitleTargeted: (n: string) => `Targeted request for ${n}`,
      coveredTitle: (n: string) => `${n} accepted`,
      cancelledTitle: 'Request cancelled',
      releasedTitle: (n: string) => `${n} released`,
      releasedBody: (t: string, w: string) => `${t} · ${w}`,
      deepLinkTab: 'requests',
      shiftsDeepLinkTab: 'shifts',
      tagPrefix: 'req',
      claimedTagPrefix: 'claim',
      cancelTagPrefix: 'cancel',
      releasedTagPrefix: 'released',
    },
    urgentSignal: {
      noun: 'Lantern',
      pushTitle: (n: string) => `${n} bell`,
      pushBody: (r: string) => r,
      escalateTitle: (r: string) => `Escalated: ${r}`,
      escalateBody: 'Escalated',
      respondedTitles: { onWay: (n: string) => `${n} otw`, thirty: (n: string) => `${n} 30`, cannot: (n: string) => `${n} cannot` },
      respondedBodies: { onWay: 'On way', thirty: '30', cannot: 'Cannot' },
      deepLinkTab: 'lantern',
      tagPrefix: 'bell',
      escalateTagPrefix: 'esc',
      respondedTagPrefix: 'resp',
      thirtyTagPrefix: 'thirty',
      cannotTagPrefix: 'cannot',
    },
    circle: { title: 'Circle' },
  }),
}));

vi.mock('@/lib/format/time', () => ({
  fmtDateTime: (d: Date) => d.toISOString(),
  fmtDateShort: (d: Date) => d.toISOString().slice(0, 10),
}));

// ── Import after mocks ───────────────────────────────────────────────────────

import { notifyBellRing, notifyNewShift } from '@/lib/notify';
import { db } from '@/lib/db';
import { pushToUser, pushToUsers } from '@/lib/push';

// Drizzle chain stub — supports .from().leftJoin().where().limit() and the
// terminal awaitable. Each returned chain.then resolves with the supplied rows.
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

// Helper: extract structured-log JSON args from console.log calls.
// We assert by event name (resilient to other log additions per Fragile area §4).
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

// ── notifyBellRing ───────────────────────────────────────────────────────────

describe('notifyBellRing — empty inner circle (L13 + L16)', () => {
  it('returns no_recipients/empty_inner_circle and emits notify_bell_ring_skip', async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce(makeSelectStub([{ id: 'b1', householdId: 'hh-1', reason: 'sick', note: null }])) // bell
      .mockReturnValueOnce(makeSelectStub([{ id: 'hh-1', name: 'Smith' }]))                                  // household
      .mockReturnValueOnce(makeSelectStub([]));                                                              // innerCircle (empty)

    const result = await notifyBellRing('b1');

    expect(result).toEqual({ kind: 'no_recipients', reason: 'empty_inner_circle' });
    expect(pushToUsers).not.toHaveBeenCalled();

    const logs = logCallsForEvent('notify_bell_ring_skip');
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ reason: 'empty_inner_circle', bellId: 'b1', householdId: 'hh-1' });
  });
});

describe('notifyBellRing — VAPID missing (L13)', () => {
  it('returns vapid_missing with the recipient count', async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce(makeSelectStub([{ id: 'b2', householdId: 'hh-1', reason: 'sick', note: null }]))
      .mockReturnValueOnce(makeSelectStub([{ id: 'hh-1', name: 'Smith' }]))
      .mockReturnValueOnce(makeSelectStub([{ id: 'u1' }, { id: 'u2' }, { id: 'u3' }]));
    vi.mocked(pushToUsers).mockResolvedValueOnce({
      attempted: 3, delivered: 0, stale: 0, failed: 3, errors: [], reason: 'vapid_not_configured',
    });

    const result = await notifyBellRing('b2');

    expect(result).toEqual({ kind: 'vapid_missing', recipients: 3 });
  });
});

describe('notifyBellRing — partial delivery (L13)', () => {
  it('returns partial with delivered/failed/errors when some succeed', async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce(makeSelectStub([{ id: 'b3', householdId: 'hh-1', reason: 'sick', note: null }]))
      .mockReturnValueOnce(makeSelectStub([{ id: 'hh-1', name: 'Smith' }]))
      .mockReturnValueOnce(makeSelectStub([{ id: 'u1' }, { id: 'u2' }, { id: 'u3' }]));
    vi.mocked(pushToUsers).mockResolvedValueOnce({
      attempted: 3, delivered: 2, stale: 0, failed: 1, errors: ['HTTP 500: provider error'],
    });

    const result = await notifyBellRing('b3');

    expect(result).toEqual({
      kind: 'partial',
      recipients: 3,
      delivered: 2,
      failed: 1,
      errors: ['HTTP 500: provider error'],
    });
  });
});

describe('notifyBellRing — full delivery (L13)', () => {
  it('returns delivered when all subscriptions succeed', async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce(makeSelectStub([{ id: 'b4', householdId: 'hh-1', reason: 'sick', note: null }]))
      .mockReturnValueOnce(makeSelectStub([{ id: 'hh-1', name: 'Smith' }]))
      .mockReturnValueOnce(makeSelectStub([{ id: 'u1' }, { id: 'u2' }]));
    vi.mocked(pushToUsers).mockResolvedValueOnce({
      attempted: 2, delivered: 2, stale: 0, failed: 0, errors: [],
    });

    const result = await notifyBellRing('b4');

    expect(result).toEqual({ kind: 'delivered', recipients: 2, delivered: 2 });
  });
});

describe('notifyBellRing — bell missing (L16)', () => {
  it('returns no_recipients and emits notify_bell_ring_skip with reason bell_missing', async () => {
    vi.mocked(db.select).mockReturnValueOnce(makeSelectStub([])); // bell select returns empty

    const result = await notifyBellRing('missing');

    expect(result).toEqual({ kind: 'no_recipients', reason: 'no_caregivers' });
    expect(pushToUsers).not.toHaveBeenCalled();

    const logs = logCallsForEvent('notify_bell_ring_skip');
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ reason: 'bell_missing', bellId: 'missing' });
  });
});

describe('notifyBellRing — push exception (L13)', () => {
  it('returns push_error with the thrown message when pushToUsers rejects', async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce(makeSelectStub([{ id: 'b5', householdId: 'hh-1', reason: 'sick', note: null }]))
      .mockReturnValueOnce(makeSelectStub([{ id: 'hh-1', name: 'Smith' }]))
      .mockReturnValueOnce(makeSelectStub([{ id: 'u1' }]));
    vi.mocked(pushToUsers).mockRejectedValueOnce(new Error('boom'));

    const result = await notifyBellRing('b5');

    expect(result).toEqual({ kind: 'push_error', recipients: 1, error: 'boom' });
  });
});

// ── notifyNewShift ───────────────────────────────────────────────────────────

describe('notifyNewShift — targeted caregiver not opted in (L13 + L16)', () => {
  it('returns no_recipients/targeted_caregiver_not_opted_in without calling push', async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce(makeSelectStub([{
        shift: { id: 's1', householdId: 'hh-1', title: 'Pickup', startsAt: new Date(), endsAt: new Date(), forWhom: null, notes: null },
        household: { id: 'hh-1', name: 'Smith' },
        creator: { id: 'u-creator', name: 'Parent' },
      }]))
      .mockReturnValueOnce(makeSelectStub([{ id: 'targeted', email: null, notifyShiftPosted: false }]));

    const result = await notifyNewShift('s1', 'targeted');

    expect(result).toEqual({ kind: 'no_recipients', reason: 'targeted_caregiver_not_opted_in' });
    expect(pushToUser).not.toHaveBeenCalled();

    const logs = logCallsForEvent('notify_new_shift_skip');
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ reason: 'targeted_caregiver_not_opted_in', shiftId: 's1', preferredCaregiverId: 'targeted' });
  });
});

describe('notifyNewShift — broadcast with no caregivers opted in (L13 + L16)', () => {
  it('returns no_recipients/no_caregivers and emits notify_new_shift_skip', async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce(makeSelectStub([{
        shift: { id: 's2', householdId: 'hh-1', title: 'Pickup', startsAt: new Date(), endsAt: new Date(), forWhom: null, notes: null },
        household: { id: 'hh-1', name: 'Smith' },
        creator: { id: 'u-creator', name: 'Parent' },
      }]))
      .mockReturnValueOnce(makeSelectStub([{ id: 'c1', email: null, notifyShiftPosted: false }]));

    const result = await notifyNewShift('s2');

    expect(result).toEqual({ kind: 'no_recipients', reason: 'no_caregivers' });
    expect(pushToUsers).not.toHaveBeenCalled();

    const logs = logCallsForEvent('notify_new_shift_skip');
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ reason: 'no_caregivers_opted_in', shiftId: 's2', householdId: 'hh-1' });
  });
});

describe('notifyNewShift — broadcast full delivery (L13)', () => {
  it('returns delivered for opted-in caregivers when push succeeds', async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce(makeSelectStub([{
        shift: { id: 's3', householdId: 'hh-1', title: 'Pickup', startsAt: new Date(), endsAt: new Date(), forWhom: null, notes: null },
        household: { id: 'hh-1', name: 'Smith' },
        creator: { id: 'u-creator', name: 'Parent' },
      }]))
      .mockReturnValueOnce(makeSelectStub([
        { id: 'c1', email: null, notifyShiftPosted: true },
        { id: 'c2', email: null, notifyShiftPosted: true },
      ]));
    vi.mocked(pushToUsers).mockResolvedValueOnce({
      attempted: 2, delivered: 2, stale: 0, failed: 0, errors: [],
    });

    const result = await notifyNewShift('s3');

    expect(result).toEqual({ kind: 'delivered', recipients: 2, delivered: 2 });
  });
});
