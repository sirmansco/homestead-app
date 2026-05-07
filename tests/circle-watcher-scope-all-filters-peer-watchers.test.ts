/**
 * Regression — /api/circle?scope=all must apply the same watcher peer-filter
 * per household as the scoped (single-household) branch.
 *
 * A watcher who belongs to multiple households was leaking peer-watcher
 * identities through the CaregiverVillage multi-household view because the
 * `scope=all` branch iterated households without filtering. Source: Codex
 * audit of PR #128 (circle invite role audit).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(),
  },
}));

vi.mock('@/lib/auth/household', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth/household')>('@/lib/auth/household');
  return {
    ...actual,
    requireHousehold: vi.fn(),
    requireHouseholdAdmin: vi.fn(),
    requireUser: vi.fn(),
  };
});

vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: vi.fn(),
}));

import { requireUser } from '@/lib/auth/household';
import { db } from '@/lib/db';
import { GET as circleGet } from '@/app/api/circle/route';

const HH_1 = 'hh-1';
const HH_2 = 'hh-2';
const CLERK_USER_ID = 'clerk_caller';

type Row = Record<string, unknown>;

function makeSelectChain(rows: Row[]) {
  const chain: Record<string, unknown> = {};
  const t = () => chain;
  chain['from'] = t; chain['where'] = t; chain['limit'] = t;
  chain['then'] = (resolve: (v: unknown) => void) => { resolve(rows); return chain; };
  chain['catch'] = () => chain; chain['finally'] = () => chain;
  return chain;
}

function makeReq() {
  return {
    nextUrl: { searchParams: new URLSearchParams('scope=all') },
    headers: { get: () => null },
    url: 'http://localhost/api/circle?scope=all',
  } as unknown as Parameters<typeof circleGet>[0];
}

// Caller is a watcher in BOTH households.
const CALLER_HH1 = { id: 'caller-1', clerkUserId: CLERK_USER_ID, name: 'Caller', email: 'caller@example.com', role: 'watcher', villageGroup: 'covey', householdId: HH_1 };
const CALLER_HH2 = { id: 'caller-2', clerkUserId: CLERK_USER_ID, name: 'Caller', email: 'caller@example.com', role: 'watcher', villageGroup: 'covey', householdId: HH_2 };

const KEEPER_1 = { id: 'keeper-1', name: 'Alice', email: 'a@example.com', role: 'keeper', villageGroup: 'covey', householdId: HH_1 };
const PEER_WATCHER_1 = { id: 'peer-watcher-1', name: 'Xander', email: 'x@example.com', role: 'watcher', villageGroup: 'covey', householdId: HH_1 };

const KEEPER_2 = { id: 'keeper-2', name: 'Bob', email: 'b@example.com', role: 'keeper', villageGroup: 'covey', householdId: HH_2 };
const PEER_WATCHER_2 = { id: 'peer-watcher-2', name: 'Yvonne', email: 'y@example.com', role: 'watcher', villageGroup: 'covey', householdId: HH_2 };

const HH_ROW_1 = { id: HH_1, name: 'Household One', glyph: '🏠' };
const HH_ROW_2 = { id: HH_2, name: 'Household Two', glyph: '🏡' };

describe('Regression — scope=all applies per-household watcher peer-filter', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('watcher caller in 2 households cannot see peer watchers in either household', async () => {
    vi.mocked(requireUser).mockResolvedValue({ userId: CLERK_USER_ID } as unknown as Awaited<ReturnType<typeof requireUser>>);

    let selectCall = 0;
    vi.mocked(db.select).mockImplementation(() => {
      selectCall++;
      // Order matches route: 1) caller's user rows, 2) households, 3) all adults, 4) all chicks.
      if (selectCall === 1) {
        return makeSelectChain([CALLER_HH1, CALLER_HH2]) as unknown as ReturnType<typeof db.select>;
      }
      if (selectCall === 2) {
        return makeSelectChain([HH_ROW_1, HH_ROW_2]) as unknown as ReturnType<typeof db.select>;
      }
      if (selectCall === 3) {
        return makeSelectChain([CALLER_HH1, CALLER_HH2, KEEPER_1, PEER_WATCHER_1, KEEPER_2, PEER_WATCHER_2]) as unknown as ReturnType<typeof db.select>;
      }
      return makeSelectChain([]) as unknown as ReturnType<typeof db.select>;
    });

    const res = await circleGet(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.families).toHaveLength(2);

    const fam1 = body.families.find((f: { household: { id: string } }) => f.household.id === HH_1);
    const fam2 = body.families.find((f: { household: { id: string } }) => f.household.id === HH_2);
    expect(fam1).toBeDefined();
    expect(fam2).toBeDefined();

    const ids1 = fam1.adults.map((a: { id: string }) => a.id).sort();
    const ids2 = fam2.adults.map((a: { id: string }) => a.id).sort();

    // Each household: keeper + caller-self only. Peer watchers must be excluded.
    expect(ids1).toEqual(['caller-1', 'keeper-1']);
    expect(ids1).not.toContain('peer-watcher-1');

    expect(ids2).toEqual(['caller-2', 'keeper-2']);
    expect(ids2).not.toContain('peer-watcher-2');
  });

  it('mixed-role caller (keeper in HH1, watcher in HH2) sees full HH1, filtered HH2', async () => {
    vi.mocked(requireUser).mockResolvedValue({ userId: CLERK_USER_ID } as unknown as Awaited<ReturnType<typeof requireUser>>);

    // Same caller identity, different role per household.
    const KEEPER_CALLER_HH1 = { ...CALLER_HH1, role: 'keeper' };
    const WATCHER_CALLER_HH2 = { ...CALLER_HH2, role: 'watcher' };

    let selectCall = 0;
    vi.mocked(db.select).mockImplementation(() => {
      selectCall++;
      if (selectCall === 1) {
        return makeSelectChain([KEEPER_CALLER_HH1, WATCHER_CALLER_HH2]) as unknown as ReturnType<typeof db.select>;
      }
      if (selectCall === 2) {
        return makeSelectChain([HH_ROW_1, HH_ROW_2]) as unknown as ReturnType<typeof db.select>;
      }
      if (selectCall === 3) {
        return makeSelectChain([KEEPER_CALLER_HH1, WATCHER_CALLER_HH2, KEEPER_1, PEER_WATCHER_1, KEEPER_2, PEER_WATCHER_2]) as unknown as ReturnType<typeof db.select>;
      }
      return makeSelectChain([]) as unknown as ReturnType<typeof db.select>;
    });

    const res = await circleGet(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();

    const fam1 = body.families.find((f: { household: { id: string } }) => f.household.id === HH_1);
    const fam2 = body.families.find((f: { household: { id: string } }) => f.household.id === HH_2);

    const ids1 = fam1.adults.map((a: { id: string }) => a.id).sort();
    const ids2 = fam2.adults.map((a: { id: string }) => a.id).sort();

    // HH1: caller is keeper → sees everyone in HH1 (including peer watcher).
    expect(ids1).toEqual(['caller-1', 'keeper-1', 'peer-watcher-1']);
    // HH2: caller is watcher → peer watcher hidden.
    expect(ids2).toEqual(['caller-2', 'keeper-2']);
    expect(ids2).not.toContain('peer-watcher-2');
  });
});
