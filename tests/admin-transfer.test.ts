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
}));

vi.mock('@/lib/auth/household', async () => {
  return {
    requireHousehold: vi.fn(),
    requireUser: vi.fn(),
  };
});

import { PATCH } from '@/app/api/household/admin/route';
import { db } from '@/lib/db';
import { requireHousehold } from '@/lib/auth/household';

// ── Constants ────────────────────────────────────────────────────────────────

const HH_ID = 'hh-001';
const ADMIN_ID = 'user-admin-1';
const TARGET_ID = 'user-target-1';
const OTHER_HH_USER_ID = 'user-other-hh';

const HOUSEHOLD = { id: HH_ID, clerkOrgId: 'org_1', name: 'Smith Family', glyph: '🏡' };

function callerRow(overrides: Partial<{ id: string; clerkUserId: string; name: string; isAdmin: boolean }> = {}) {
  return {
    id: ADMIN_ID,
    clerkUserId: 'clerk_admin',
    householdId: HH_ID,
    email: 'admin@example.com',
    name: 'Alice Admin',
    role: 'parent' as const,
    villageGroup: 'inner_circle' as const,
    isAdmin: true,
    ...overrides,
  };
}

function targetRow(overrides: Partial<{ id: string; clerkUserId: string; name: string; isAdmin: boolean }> = {}) {
  return {
    id: TARGET_ID,
    clerkUserId: 'clerk_target',
    householdId: HH_ID,
    email: 'target@example.com',
    name: 'Bob Target',
    role: 'parent' as const,
    villageGroup: 'inner_circle' as const,
    isAdmin: false,
    ...overrides,
  };
}

// ── Drizzle chain builders ───────────────────────────────────────────────────

type Row = Record<string, unknown>;

function makeSelectStub(rows: Row[]) {
  const chain: Record<string, unknown> = {};
  const terminal = () => chain;
  chain['from']    = terminal;
  chain['where']   = terminal;
  chain['limit']   = terminal;
  chain['orderBy'] = terminal;
  chain['then']    = (resolve: (v: unknown) => void) => { resolve(rows); return chain; };
  chain['catch']   = () => chain;
  chain['finally'] = () => chain;
  return chain;
}

function makeUpdateStub(returningRows: Row[] = []) {
  const chain: Record<string, unknown> = {};
  const terminal = () => chain;
  chain['set']       = terminal;
  chain['where']     = terminal;
  chain['returning'] = terminal;
  chain['then']    = (resolve: (v: unknown) => void) => { resolve(returningRows); return chain; };
  chain['catch']   = () => chain;
  chain['finally'] = () => chain;
  return chain;
}

// Build a `tx` object with select/update stubs that callers stage in order.
type TxStubs = { selects: Row[][]; updates: Row[][]; };

function makeTxRunner(stubs: TxStubs) {
  let selectIdx = 0;
  let updateIdx = 0;
  const tx = {
    select: vi.fn(() => makeSelectStub(stubs.selects[selectIdx++] ?? [])),
    update: vi.fn(() => makeUpdateStub(stubs.updates[updateIdx++] ?? [])),
  };
  return tx;
}

// Wire db.transaction so the callback runs against a staged `tx`. If the
// callback throws, mirror the real Drizzle behavior and rethrow.
function stageTransaction(stubs: TxStubs) {
  vi.mocked(db.transaction).mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
    const tx = makeTxRunner(stubs);
    return cb(tx);
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fakeReq(body: unknown): Parameters<typeof PATCH>[0] {
  return {
    json: async () => body,
  } as unknown as Parameters<typeof PATCH>[0];
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('PATCH /api/household/admin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireHousehold).mockResolvedValue({
      household: HOUSEHOLD,
      user: callerRow(),
      userId: 'clerk_admin',
      orgId: 'org_1',
    } as unknown as Awaited<ReturnType<typeof requireHousehold>>);
  });

  it('happy path — admin transfers to non-admin member', async () => {
    stageTransaction({
      selects: [
        [{ id: ADMIN_ID, isAdmin: true }],          // caller re-read inside tx
        [targetRow({ isAdmin: false })],            // target lookup
      ],
      updates: [
        [],                                         // demote caller (no returning)
        [targetRow({ isAdmin: true })],             // promote target (with returning)
      ],
    });

    const res = await PATCH(fakeReq({ targetUserId: TARGET_ID }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.newAdmin.id).toBe(TARGET_ID);
    expect(body.newAdmin.isAdmin).toBe(true);
  });

  it('rejects missing targetUserId with 400', async () => {
    const res = await PATCH(fakeReq({}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('targetUserId required');
  });

  it('rejects self-transfer with 400 same_user', async () => {
    const res = await PATCH(fakeReq({ targetUserId: ADMIN_ID }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('same_user');
  });

  it('non-admin caller — caller.isAdmin is false at re-read → 403', async () => {
    // The outer requireHousehold returned a caller — that's the auth check.
    // Inside the transaction we re-read and find isAdmin=false (e.g., a
    // concurrent transfer demoted us between request start and tx open).
    stageTransaction({
      selects: [
        [{ id: ADMIN_ID, isAdmin: false }],         // caller re-read: NOT admin
      ],
      updates: [],
    });

    const res = await PATCH(fakeReq({ targetUserId: TARGET_ID }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('no_access');
  });

  it('target not in household → 404 member_not_found', async () => {
    stageTransaction({
      selects: [
        [{ id: ADMIN_ID, isAdmin: true }],          // caller re-read
        [],                                         // target lookup empty
      ],
      updates: [],
    });

    const res = await PATCH(fakeReq({ targetUserId: OTHER_HH_USER_ID }));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('member_not_found');
  });

  it('tombstoned target by name → 404 member_not_found', async () => {
    stageTransaction({
      selects: [
        [{ id: ADMIN_ID, isAdmin: true }],
        [targetRow({ name: '[deleted]' })],
      ],
      updates: [],
    });

    const res = await PATCH(fakeReq({ targetUserId: TARGET_ID }));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('member_not_found');
  });

  it('tombstoned target by clerkUserId prefix → 404 member_not_found', async () => {
    stageTransaction({
      selects: [
        [{ id: ADMIN_ID, isAdmin: true }],
        [targetRow({ clerkUserId: `deleted+${TARGET_ID}` })],
      ],
      updates: [],
    });

    const res = await PATCH(fakeReq({ targetUserId: TARGET_ID }));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('member_not_found');
  });

  it('concurrent transfer race — caller demoted mid-flight → 403', async () => {
    // Simulate: between requireHousehold() (which saw isAdmin=true via the
    // outer user fetch) and the transaction open, another admin's transfer
    // committed and demoted us. Inside-tx re-read reflects the commit.
    stageTransaction({
      selects: [
        [{ id: ADMIN_ID, isAdmin: false }],
      ],
      updates: [],
    });

    const res = await PATCH(fakeReq({ targetUserId: TARGET_ID }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('no_access');
  });
});
