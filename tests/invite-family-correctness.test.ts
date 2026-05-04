import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('@/lib/auth/household', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth/household')>('@/lib/auth/household');
  return {
    ...actual,
    requireHousehold: vi.fn(),
    requireUser: vi.fn(),
  };
});

vi.mock('@/lib/ratelimit', () => ({
  rateLimit: vi.fn().mockReturnValue({ limited: false }),
  rateLimitResponse: vi.fn().mockReturnValue(null),
}));

vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: vi.fn(),
}));

import { requireHousehold, requireUser } from '@/lib/auth/household';
import { db } from '@/lib/db';
import { clerkClient } from '@clerk/nextjs/server';
import { POST as invitePost } from '@/app/api/circle/invite-family/route';
import { GET as acceptGet, POST as acceptPost } from '@/app/api/circle/invite-family/accept/route';

const HH_ID = 'hh-1';
const USER_ID = 'user-1';
const CLERK_ID = 'clerk_1';
const INVITE_EMAIL = 'parent@example.com';
const TOKEN = 'tok-abc123';
const INVITE_ID = 'invite-1';

function mockHousehold() {
  vi.mocked(requireHousehold).mockResolvedValue({
    household: { id: HH_ID, clerkOrgId: 'org_1' },
    user: { id: USER_ID, clerkUserId: CLERK_ID, householdId: HH_ID, role: 'keeper', isAdmin: false },
    userId: CLERK_ID,
    orgId: 'org_1',
  } as unknown as Awaited<ReturnType<typeof requireHousehold>>);
}

function mockUser(clerkId = CLERK_ID) {
  vi.mocked(requireUser).mockResolvedValue({
    userId: clerkId,
  } as unknown as Awaited<ReturnType<typeof requireUser>>);
}

function mockClerk(email: string) {
  vi.mocked(clerkClient).mockResolvedValue({
    users: {
      getUser: vi.fn().mockResolvedValue({
        primaryEmailAddress: { emailAddress: email },
      }),
    },
  } as unknown as Awaited<ReturnType<typeof clerkClient>>);
}

type Row = Record<string, unknown>;

function makeSelectChain(rows: Row[]) {
  const chain: Record<string, unknown> = {};
  const t = () => chain;
  chain['from'] = t; chain['where'] = t; chain['limit'] = t; chain['innerJoin'] = t;
  chain['then'] = (resolve: (v: unknown) => void) => { resolve(rows); return chain; };
  chain['catch'] = () => chain; chain['finally'] = () => chain;
  return chain;
}

function makeInsertChain() {
  const chain: Record<string, unknown> = {};
  const t = () => chain;
  chain['values'] = t; chain['returning'] = t;
  chain['then'] = (resolve: (v: unknown) => void) => { resolve([]); return chain; };
  chain['catch'] = () => chain; chain['finally'] = () => chain;
  return chain;
}

function makeUpdateChain(rows: Row[] = []) {
  const chain: Record<string, unknown> = {};
  const t = () => chain;
  chain['set'] = t; chain['where'] = t; chain['returning'] = t;
  chain['then'] = (resolve: (v: unknown) => void) => { resolve(rows); return chain; };
  chain['catch'] = () => chain; chain['finally'] = () => chain;
  return chain;
}

function makeReq(body: unknown, url = 'http://localhost/api/circle/invite-family') {
  return {
    json: () => Promise.resolve(body),
    headers: { get: () => 'http://localhost' },
    url,
    nextUrl: { searchParams: new URLSearchParams() },
  } as unknown as Parameters<typeof invitePost>[0];
}

function makeGetReq(token: string) {
  return {
    url: `http://localhost/api/circle/invite-family/accept?token=${token}`,
  } as unknown as Parameters<typeof acceptGet>[0];
}

function makeAcceptReq(body: unknown) {
  return {
    json: () => Promise.resolve(body),
    url: 'http://localhost/api/circle/invite-family/accept',
  } as unknown as Parameters<typeof acceptPost>[0];
}

function pendingInvite(overrides: Partial<Row> = {}): Row {
  return {
    id: INVITE_ID,
    token: TOKEN,
    parentEmail: INVITE_EMAIL,
    status: 'pending',
    expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
    fromUserId: USER_ID,
    acceptedHouseholdId: null,
    ...overrides,
  };
}

// ── POST /api/circle/invite-family ────────────────────────────────────────────

describe('POST /api/circle/invite-family — fromUserId from requireHousehold (F-P2-A)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('uses user.id from requireHousehold, not a separate DB select', async () => {
    mockHousehold();
    vi.mocked(db.insert).mockReturnValue(makeInsertChain() as unknown as ReturnType<typeof db.insert>);

    const res = await invitePost(makeReq({ parentEmail: INVITE_EMAIL }));
    expect(res.status).toBe(200);
    // requireHousehold was called; requireUser was NOT called
    expect(vi.mocked(requireHousehold)).toHaveBeenCalledOnce();
    // insert was called (not a separate user select first)
    expect(vi.mocked(db.insert)).toHaveBeenCalledOnce();
    expect(vi.mocked(db.select)).not.toHaveBeenCalled();
  });

  it('missing parentEmail → 400', async () => {
    mockHousehold();
    const res = await invitePost(makeReq({ parentEmail: '' }));
    expect(res.status).toBe(400);
  });
});

// ── GET /api/circle/invite-family/accept ──────────────────────────────────────

describe('GET /api/circle/invite-family/accept — expiry check (F-P1-G)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('valid pending invite → 200', async () => {
    vi.mocked(db.select).mockReturnValue(
      makeSelectChain([pendingInvite()]) as unknown as ReturnType<typeof db.select>,
    );
    const res = await acceptGet(makeGetReq(TOKEN));
    expect(res.status).toBe(200);
  });

  it('expired invite → 410 invite_expired', async () => {
    vi.mocked(db.select).mockReturnValue(
      makeSelectChain([pendingInvite({ expiresAt: new Date(Date.now() - 1000) })]) as unknown as ReturnType<typeof db.select>,
    );
    const res = await acceptGet(makeGetReq(TOKEN));
    expect(res.status).toBe(410);
    const body = await res.json();
    expect(body.error).toBe('invite_expired');
  });

  it('already used invite → 410 invite_used', async () => {
    vi.mocked(db.select).mockReturnValue(
      makeSelectChain([pendingInvite({ status: 'accepted' })]) as unknown as ReturnType<typeof db.select>,
    );
    const res = await acceptGet(makeGetReq(TOKEN));
    expect(res.status).toBe(410);
    const body = await res.json();
    expect(body.error).toBe('invite_used');
  });

  it('valid invite → response excludes parentEmail (pre-auth PII scrub)', async () => {
    vi.mocked(db.select).mockReturnValue(
      makeSelectChain([pendingInvite({
        fromName: 'Alice',
        villageGroup: 'covey',
        parentName: 'Bob',
      })]) as unknown as ReturnType<typeof db.select>,
    );
    const res = await acceptGet(makeGetReq(TOKEN));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.invite).not.toHaveProperty('parentEmail');
    // still returns enough to render the accept page
    expect(body.invite.fromName).toBe('Alice');
    expect(body.invite.villageGroup).toBe('covey');
    expect(body.invite.parentName).toBe('Bob');
  });
});

// ── POST /api/circle/invite-family/accept ─────────────────────────────────────

describe('POST /api/circle/invite-family/accept — email match (F-P1-F)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('email matches → 200', async () => {
    mockUser();
    mockClerk(INVITE_EMAIL);
    let selectCall = 0;
    vi.mocked(db.select).mockImplementation(() => {
      selectCall++;
      if (selectCall === 1) return makeSelectChain([pendingInvite()]) as unknown as ReturnType<typeof db.select>;
      return makeSelectChain([{ householdId: HH_ID }]) as unknown as ReturnType<typeof db.select>;
    });
    vi.mocked(db.update).mockReturnValue(
      makeUpdateChain([{ id: INVITE_ID, status: 'accepted' }]) as unknown as ReturnType<typeof db.update>,
    );

    const res = await acceptPost(makeAcceptReq({ token: TOKEN }));
    expect(res.status).toBe(200);
  });

  it('email mismatch → 403 email_mismatch', async () => {
    mockUser();
    mockClerk('wrong@example.com');
    vi.mocked(db.select).mockReturnValue(
      makeSelectChain([pendingInvite()]) as unknown as ReturnType<typeof db.select>,
    );

    const res = await acceptPost(makeAcceptReq({ token: TOKEN }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('email_mismatch');
    expect(vi.mocked(db.update)).not.toHaveBeenCalled();
  });

  it('expired invite → 410 invite_expired (POST also checks)', async () => {
    mockUser();
    mockClerk(INVITE_EMAIL);
    vi.mocked(db.select).mockReturnValue(
      makeSelectChain([pendingInvite({ expiresAt: new Date(Date.now() - 1000) })]) as unknown as ReturnType<typeof db.select>,
    );

    const res = await acceptPost(makeAcceptReq({ token: TOKEN }));
    expect(res.status).toBe(410);
    const body = await res.json();
    expect(body.error).toBe('invite_expired');
    expect(vi.mocked(db.update)).not.toHaveBeenCalled();
  });

  it('concurrent double-accept → second gets 410 invite_used', async () => {
    mockUser();
    mockClerk(INVITE_EMAIL);
    let selectCall = 0;
    vi.mocked(db.select).mockImplementation(() => {
      selectCall++;
      if (selectCall === 1) return makeSelectChain([pendingInvite()]) as unknown as ReturnType<typeof db.select>;
      return makeSelectChain([{ householdId: HH_ID }]) as unknown as ReturnType<typeof db.select>;
    });
    // UPDATE returns 0 rows — status predicate mismatch (another request won)
    vi.mocked(db.update).mockReturnValue(
      makeUpdateChain([]) as unknown as ReturnType<typeof db.update>,
    );

    const res = await acceptPost(makeAcceptReq({ token: TOKEN }));
    expect(res.status).toBe(410);
    const body = await res.json();
    expect(body.error).toBe('invite_used');
  });
});
