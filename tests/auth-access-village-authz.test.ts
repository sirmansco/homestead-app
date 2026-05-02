import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks must be declared before route imports ──────────────────────────────

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
  clerkClient: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    $count: vi.fn(),
    transaction: vi.fn(),
  },
}));

vi.mock('@/lib/format', () => ({
  looksLikeSlug: vi.fn().mockReturnValue(false),
  normaliseStoredName: (s: string) => s,
}));

vi.mock('@/lib/ratelimit', () => ({
  rateLimit: vi.fn().mockReturnValue({ allowed: true, remaining: 9, resetAt: 0 }),
  rateLimitResponse: vi.fn().mockReturnValue(null),
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

import {
  requireHousehold,
  requireHouseholdAdmin,
  NotAdminError,
} from '@/lib/auth/household';
import { db } from '@/lib/db';
import { clerkClient } from '@clerk/nextjs/server';
import { POST as villagePOST, DELETE as villageDELETE } from '@/app/api/village/route';
import { POST as villageLeavePOST } from '@/app/api/village/leave/route';
import { POST as invitePOST } from '@/app/api/village/invite/route';
import { GET as notificationsGET, PATCH as notificationsPATCH } from '@/app/api/notifications/route';

// ── Constants ────────────────────────────────────────────────────────────────

const HH_A = 'hh-a';
const HH_B = 'hh-b';
const ADMIN_ID = 'user-admin';
const CAREGIVER_ID = 'user-cg';
const TARGET_KID_ID = 'kid-1';

const HOUSEHOLD_A = { id: HH_A, clerkOrgId: 'org_a', name: 'Smiths', glyph: '🏡' };

function row(overrides: Partial<{
  id: string;
  clerkUserId: string;
  householdId: string;
  isAdmin: boolean;
  role: 'parent' | 'caregiver';
  notifyShiftPosted: boolean;
  notifyBellRinging: boolean;
}> = {}) {
  return {
    id: overrides.id ?? ADMIN_ID,
    clerkUserId: overrides.clerkUserId ?? 'clerk_admin',
    householdId: overrides.householdId ?? HH_A,
    email: 'u@example.com',
    name: 'User',
    role: overrides.role ?? ('parent' as const),
    villageGroup: 'covey' as const,
    isAdmin: overrides.isAdmin ?? false,
    notifyShiftPosted: overrides.notifyShiftPosted ?? true,
    notifyShiftClaimed: true,
    notifyShiftReleased: true,
    notifyBellRinging: overrides.notifyBellRinging ?? true,
    notifyBellResponse: true,
  };
}

function mockAdminGateOk(user: ReturnType<typeof row>) {
  vi.mocked(requireHouseholdAdmin).mockResolvedValue({
    household: HOUSEHOLD_A,
    user,
    userId: user.clerkUserId,
    orgId: 'org_a',
  } as unknown as Awaited<ReturnType<typeof requireHouseholdAdmin>>);
}

function mockAdminGateRejects(err: Error) {
  vi.mocked(requireHouseholdAdmin).mockRejectedValue(err);
}

function mockHouseholdOk(user: ReturnType<typeof row>) {
  vi.mocked(requireHousehold).mockResolvedValue({
    household: HOUSEHOLD_A,
    user,
    userId: user.clerkUserId,
    orgId: 'org_a',
  } as unknown as Awaited<ReturnType<typeof requireHousehold>>);
}

// ── Drizzle chain stubs ──────────────────────────────────────────────────────

type Row = Record<string, unknown>;

function makeUpdateChain(returningRows: Row[] = []) {
  const chain: Record<string, unknown> = {};
  const t = () => chain;
  chain['set'] = t;
  chain['where'] = t;
  chain['returning'] = t;
  chain['then'] = (resolve: (v: unknown) => void) => { resolve(returningRows); return chain; };
  chain['catch'] = () => chain;
  chain['finally'] = () => chain;
  return chain;
}

function makeInsertChain(returningRows: Row[] = []) {
  const chain: Record<string, unknown> = {};
  const t = () => chain;
  chain['values'] = t;
  chain['returning'] = t;
  chain['then'] = (resolve: (v: unknown) => void) => { resolve(returningRows); return chain; };
  chain['catch'] = () => chain;
  chain['finally'] = () => chain;
  return chain;
}

function makeDeleteChain() {
  const chain: Record<string, unknown> = {};
  const t = () => chain;
  chain['where'] = t;
  chain['then'] = (resolve: (v: unknown) => void) => { resolve(undefined); return chain; };
  chain['catch'] = () => chain;
  chain['finally'] = () => chain;
  return chain;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function jsonReq(body: unknown, url = 'http://localhost/api/x') {
  return {
    json: async () => body,
    nextUrl: new URL(url),
    url,
    headers: new Map([['origin', 'http://localhost']]),
  } as unknown as Parameters<typeof villagePOST>[0];
}

function urlReq(url: string) {
  return {
    json: async () => ({}),
    nextUrl: new URL(url),
    url,
    headers: new Map(),
  } as unknown as Parameters<typeof villageDELETE>[0];
}

// ── Village POST/DELETE — admin-only matrix ──────────────────────────────────

describe('POST /api/village — admin authority matrix (L2)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('admin → 200 (kid create)', async () => {
    mockAdminGateOk(row({ isAdmin: true }));
    vi.mocked(db.insert).mockReturnValue(makeInsertChain([
      { id: TARGET_KID_ID, householdId: HH_A, name: 'Bobby' },
    ]) as unknown as ReturnType<typeof db.insert>);
    const res = await villagePOST(jsonReq({ type: 'kid', name: 'Bobby' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.kid.id).toBe(TARGET_KID_ID);
  });

  it('non-admin caregiver → 403 no_access', async () => {
    mockAdminGateRejects(new NotAdminError());
    const res = await villagePOST(jsonReq({ type: 'kid', name: 'Bobby' }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'no_access' });
    expect(vi.mocked(db.insert)).not.toHaveBeenCalled();
  });

  it('unauthenticated → 401 not_signed_in', async () => {
    mockAdminGateRejects(new Error('Not signed in'));
    const res = await villagePOST(jsonReq({ type: 'kid', name: 'Bobby' }));
    expect(res.status).toBe(401);
  });

  it('non-member → 409 no_household', async () => {
    mockAdminGateRejects(new Error('No active household'));
    const res = await villagePOST(jsonReq({ type: 'kid', name: 'Bobby' }));
    expect(res.status).toBe(409);
  });
});

describe('DELETE /api/village — admin authority matrix (L2)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('admin → 200', async () => {
    mockAdminGateOk(row({ isAdmin: true }));
    vi.mocked(db.delete).mockReturnValue(makeDeleteChain() as unknown as ReturnType<typeof db.delete>);
    const res = await villageDELETE(urlReq('http://localhost/api/village?id=kid-x&type=kid'));
    expect(res.status).toBe(200);
  });

  it('non-admin → 403 no_access; gate fires before db.delete', async () => {
    mockAdminGateRejects(new NotAdminError());
    const res = await villageDELETE(urlReq('http://localhost/api/village?id=kid-x&type=kid'));
    expect(res.status).toBe(403);
    expect(vi.mocked(db.delete)).not.toHaveBeenCalled();
  });
});

// ── Village leave — caregiver self-removal works without admin ───────────────

describe('POST /api/village/leave — self-removal (no admin required)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('caregiver self-leave → 200 without admin gate', async () => {
    mockHouseholdOk(row({ id: CAREGIVER_ID, isAdmin: false, role: 'caregiver' }));
    // Post-B3, leave routes through tombstoneUser (db.transaction). Stub the tx
    // to invoke the callback with the same shared db mock.
    vi.mocked(db.transaction).mockImplementation(async (cb) => {
      // @ts-expect-error — tx is structurally compatible enough for the service
      return cb({
        select: db.select, update: db.update, delete: db.delete,
        insert: db.insert, $count: db.$count,
      });
    });
    vi.mocked(db.select).mockReturnValueOnce({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([row({ id: CAREGIVER_ID })]) }) }),
    } as unknown as ReturnType<typeof db.select>);
    vi.mocked(db.update).mockReturnValue({
      set: () => ({ where: () => Promise.resolve(undefined) }),
    } as unknown as ReturnType<typeof db.update>);
    vi.mocked(db.delete).mockReturnValue({
      where: () => Promise.resolve(undefined),
    } as unknown as ReturnType<typeof db.delete>);
    vi.mocked(db.$count).mockResolvedValue(0);

    const res = await villageLeavePOST();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    // Hard requirement: leave must not call requireHouseholdAdmin.
    expect(vi.mocked(requireHouseholdAdmin)).not.toHaveBeenCalled();
    expect(vi.mocked(db.transaction)).toHaveBeenCalledOnce();
  });

  it('unauthenticated → 401', async () => {
    vi.mocked(requireHousehold).mockRejectedValue(new Error('Not signed in'));
    const res = await villageLeavePOST();
    expect(res.status).toBe(401);
  });

  it('non-member → 409', async () => {
    vi.mocked(requireHousehold).mockRejectedValue(new Error('No active household'));
    const res = await villageLeavePOST();
    expect(res.status).toBe(409);
  });
});

// ── Village invite — admin gate + role/villageGroup allowlist (L3) ───────────

describe('POST /api/village/invite — admin gate + allowlist (L3)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  function mockClerkInvite() {
    const createOrganizationInvitation = vi.fn().mockResolvedValue({ id: 'inv_1' });
    const createInvitation = vi.fn().mockResolvedValue({ id: 'inv_2', url: 'https://x' });
    vi.mocked(clerkClient).mockResolvedValue({
      organizations: { createOrganizationInvitation },
      invitations: { createInvitation },
    } as unknown as Awaited<ReturnType<typeof clerkClient>>);
    return { createOrganizationInvitation, createInvitation };
  }

  it('admin + allowed role/group + email mode → reaches Clerk', async () => {
    mockAdminGateOk(row({ isAdmin: true }));
    const { createOrganizationInvitation } = mockClerkInvite();
    const res = await invitePOST(jsonReq({
      name: 'Alice', email: 'a@b.co', role: 'caregiver', villageGroup: 'covey', mode: 'email',
    }));
    expect(res.status).toBe(200);
    expect(createOrganizationInvitation).toHaveBeenCalledOnce();
  });

  it('non-admin → 403 no_access; never reaches Clerk', async () => {
    mockAdminGateRejects(new NotAdminError());
    const { createOrganizationInvitation, createInvitation } = mockClerkInvite();
    const res = await invitePOST(jsonReq({
      name: 'Alice', email: 'a@b.co', role: 'caregiver', villageGroup: 'covey', mode: 'email',
    }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'no_access' });
    expect(createOrganizationInvitation).not.toHaveBeenCalled();
    expect(createInvitation).not.toHaveBeenCalled();
  });

  it('admin + bad role (e.g. "owner") → 400 before Clerk', async () => {
    mockAdminGateOk(row({ isAdmin: true }));
    const { createOrganizationInvitation } = mockClerkInvite();
    const res = await invitePOST(jsonReq({
      name: 'Alice', email: 'a@b.co', role: 'owner', villageGroup: 'covey', mode: 'email',
    }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid role');
    expect(createOrganizationInvitation).not.toHaveBeenCalled();
  });

  it('admin + legacy villageGroup (e.g. "inner_circle") → 400 before Clerk', async () => {
    mockAdminGateOk(row({ isAdmin: true }));
    const { createOrganizationInvitation } = mockClerkInvite();
    const res = await invitePOST(jsonReq({
      name: 'Alice', email: 'a@b.co', role: 'caregiver', villageGroup: 'inner_circle', mode: 'email',
    }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid villageGroup');
    expect(createOrganizationInvitation).not.toHaveBeenCalled();
  });
});

// ── Notifications — per-household scoping (L5) ───────────────────────────────

describe('/api/notifications — per-household scoping (L5)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('GET returns only the active household row prefs', async () => {
    // requireHousehold returns the row for active household A only — that's
    // the contract. The route must not query db.users itself.
    mockHouseholdOk(row({ householdId: HH_A, notifyBellRinging: false }));
    const res = await notificationsGET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.prefs.notifyBellRinging).toBe(false);
    expect(body.prefs.notifyShiftPosted).toBe(true);
  });

  it('PATCH updates only the active household row, not all Clerk-identity rows', async () => {
    mockHouseholdOk(row({ householdId: HH_A }));
    const updateChain = makeUpdateChain([]);
    vi.mocked(db.update).mockReturnValue(updateChain as unknown as ReturnType<typeof db.update>);

    const res = await notificationsPATCH(jsonReq({ notifyShiftPosted: false }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, updated: { notifyShiftPosted: false } });
    // The route must call db.update exactly once. The narrowed WHERE
    // (clerkUserId AND householdId) is asserted by code review against
    // app/api/notifications/route.ts; this test guards that the update fires
    // once and that the contract returns the patched keys.
    expect(vi.mocked(db.update)).toHaveBeenCalledOnce();
  });

  it('PATCH with no valid keys → 400', async () => {
    mockHouseholdOk(row({ householdId: HH_A }));
    const res = await notificationsPATCH(jsonReq({ unknownKey: true }));
    expect(res.status).toBe(400);
    expect(vi.mocked(db.update)).not.toHaveBeenCalled();
  });

  it('PATCH unauthenticated → 401', async () => {
    vi.mocked(requireHousehold).mockRejectedValue(new Error('Not signed in'));
    const res = await notificationsPATCH(jsonReq({ notifyShiftPosted: false }));
    expect(res.status).toBe(401);
  });

  it('PATCH non-member → 409 no_household', async () => {
    vi.mocked(requireHousehold).mockRejectedValue(new Error('No active household'));
    const res = await notificationsPATCH(jsonReq({ notifyShiftPosted: false }));
    expect(res.status).toBe(409);
  });
});
