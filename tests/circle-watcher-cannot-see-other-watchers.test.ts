/**
 * Bug #2 (BUGS.md 2026-05-06) — Watchers can see other watchers in the Circle.
 *
 * Privacy violation. A watcher in a household should see keepers + chicks +
 * themselves, never other watchers in the same household.
 *
 * Filter at /api/circle GET (household scope). Server-side; UI just renders
 * the response.
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

import { requireHousehold } from '@/lib/auth/household';
import { db } from '@/lib/db';
import { GET as circleGet } from '@/app/api/circle/route';

const HH_ID = 'hh-1';

type Row = Record<string, unknown>;

function makeSelectChain(rows: Row[]) {
  const chain: Record<string, unknown> = {};
  const t = () => chain;
  chain['from'] = t; chain['where'] = t; chain['limit'] = t;
  chain['then'] = (resolve: (v: unknown) => void) => { resolve(rows); return chain; };
  chain['catch'] = () => chain; chain['finally'] = () => chain;
  return chain;
}

function mockViewer(role: 'keeper' | 'watcher', userId: string) {
  vi.mocked(requireHousehold).mockResolvedValue({
    household: { id: HH_ID, clerkOrgId: 'org_1' },
    user: { id: userId, clerkUserId: `clerk_${userId}`, householdId: HH_ID, role, isAdmin: false },
    userId: `clerk_${userId}`,
    orgId: 'org_1',
  } as unknown as Awaited<ReturnType<typeof requireHousehold>>);
}

function makeReq() {
  return {
    nextUrl: { searchParams: new URLSearchParams() },
    headers: { get: () => null },
    url: 'http://localhost/api/circle',
  } as unknown as Parameters<typeof circleGet>[0];
}

const KEEPER_A = { id: 'keeper-a', name: 'Alice', email: 'a@example.com', role: 'keeper', villageGroup: 'covey', householdId: HH_ID };
const KEEPER_B = { id: 'keeper-b', name: 'Bob', email: 'b@example.com', role: 'keeper', villageGroup: 'covey', householdId: HH_ID };
const WATCHER_X = { id: 'watcher-x', name: 'Xander', email: 'x@example.com', role: 'watcher', villageGroup: 'covey', householdId: HH_ID };
const WATCHER_Y = { id: 'watcher-y', name: 'Yvonne', email: 'y@example.com', role: 'watcher', villageGroup: 'field', householdId: HH_ID };
const CHICK_1 = { id: 'chick-1', name: 'Kid', householdId: HH_ID, birthday: null, notes: null, photoUrl: null };

describe('Bug #2 — watcher viewer does not see peer watchers', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('watcher viewing GET /api/circle gets keepers + chicks + self only', async () => {
    mockViewer('watcher', WATCHER_X.id);
    let selectCall = 0;
    vi.mocked(db.select).mockImplementation(() => {
      selectCall++;
      if (selectCall === 1) {
        return makeSelectChain([KEEPER_A, KEEPER_B, WATCHER_X, WATCHER_Y]) as unknown as ReturnType<typeof db.select>;
      }
      return makeSelectChain([CHICK_1]) as unknown as ReturnType<typeof db.select>;
    });

    const res = await circleGet(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();

    const adultIds = body.adults.map((a: { id: string }) => a.id).sort();
    // Should see: KEEPER_A, KEEPER_B, WATCHER_X (self) — NOT WATCHER_Y
    expect(adultIds).toEqual(['keeper-a', 'keeper-b', 'watcher-x']);
    // Chicks unaffected by the filter
    expect(body.chicks).toHaveLength(1);
    expect(body.chicks[0].id).toBe('chick-1');
  });

  it('keeper viewing GET /api/circle still sees everyone', async () => {
    mockViewer('keeper', KEEPER_A.id);
    let selectCall = 0;
    vi.mocked(db.select).mockImplementation(() => {
      selectCall++;
      if (selectCall === 1) {
        return makeSelectChain([KEEPER_A, KEEPER_B, WATCHER_X, WATCHER_Y]) as unknown as ReturnType<typeof db.select>;
      }
      return makeSelectChain([CHICK_1]) as unknown as ReturnType<typeof db.select>;
    });

    const res = await circleGet(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();

    const adultIds = body.adults.map((a: { id: string }) => a.id).sort();
    expect(adultIds).toEqual(['keeper-a', 'keeper-b', 'watcher-x', 'watcher-y']);
  });

  it('watcher with no peer watchers sees keepers + self only (no edge case break)', async () => {
    mockViewer('watcher', WATCHER_X.id);
    let selectCall = 0;
    vi.mocked(db.select).mockImplementation(() => {
      selectCall++;
      if (selectCall === 1) {
        return makeSelectChain([KEEPER_A, WATCHER_X]) as unknown as ReturnType<typeof db.select>;
      }
      return makeSelectChain([]) as unknown as ReturnType<typeof db.select>;
    });

    const res = await circleGet(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();

    const adultIds = body.adults.map((a: { id: string }) => a.id).sort();
    expect(adultIds).toEqual(['keeper-a', 'watcher-x']);
  });
});
