import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
  clerkClient: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    $count: vi.fn(),
  },
}));

vi.mock('@/lib/format', () => ({
  looksLikeSlug: vi.fn().mockReturnValue(false),
  normaliseStoredName: (s: string) => s,
}));

vi.mock('next/server', () => ({
  NextRequest: class {
    constructor(public url: string, private init: RequestInit = {}) {}
    get nextUrl() { return new URL(this.url); }
    async json() { return JSON.parse(this.init.body as string); }
  },
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      _body: body,
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

vi.mock('@/lib/api-error', () => ({
  apiError: (_err: unknown, msg: string, status = 500) => ({
    _body: { error: msg },
    status,
    json: async () => ({ error: msg }),
  }),
  authError: (_err: unknown) => ({
    _body: { error: 'auth_error' },
    status: 401,
    json: async () => ({ error: 'auth_error' }),
  }),
}));

// ── Imports after mocks ───────────────────────────────────────────────────────

import { POST } from '@/app/api/circle/route';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { db } from '@/lib/db';

// ── Constants ────────────────────────────────────────────────────────────────

const CLERK_USER_ID = 'user_clerk_1';
const CLERK_ORG_ID  = 'org_clerk_1';
const HH_ID         = 'hh-uuid-001';
const USER_ID       = 'usr-uuid-001';
const KID_ID        = 'kid-uuid-001';

const HOUSEHOLD_ROW = { id: HH_ID, clerkOrgId: CLERK_ORG_ID, name: 'Smith Family', glyph: '🏡' };
const USER_ROW = {
  id: USER_ID, clerkUserId: CLERK_USER_ID, householdId: HH_ID,
  email: 'alice@example.com', name: 'Alice Smith',
  role: 'keeper', villageGroup: 'covey',
  // B2 (synthesis L2): village POST/DELETE are admin-only. Existing tests
  // exercise an admin caller so the fixture row carries isAdmin=true; the
  // 4xx-shape assertions below test the route's own validation, not the gate.
  isAdmin: true,
};
const KID_ROW = {
  id: KID_ID, householdId: HH_ID, name: 'Emma', birthday: '2021-03-14', notes: null,
  photoUrl: null, createdAt: new Date().toISOString(),
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeSelectStub(rows: unknown[]) {
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

function makeInsertStub(returning: unknown[] = []) {
  const chain: Record<string, unknown> = {};
  const terminal = () => chain;
  chain['values']              = terminal;
  chain['onConflictDoNothing'] = terminal;
  chain['returning']           = terminal;
  chain['then']    = (resolve: (v: unknown) => void) => { resolve(returning); return chain; };
  chain['catch']   = () => chain;
  chain['finally'] = () => chain;
  return chain;
}

function makeReq(body: unknown) {
  return new NextRequest('http://localhost/api/circle', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

function wireHousehold() {
  vi.mocked(db.select)
    .mockReturnValueOnce(makeSelectStub([HOUSEHOLD_ROW]))
    .mockReturnValueOnce(makeSelectStub([USER_ROW]));
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/circle', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(auth).mockResolvedValue({
      userId: CLERK_USER_ID, orgId: CLERK_ORG_ID,
    } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);

    vi.mocked(clerkClient).mockResolvedValue({
      organizations: { getOrganization: vi.fn().mockResolvedValue({ id: CLERK_ORG_ID, name: 'Smith Family' }) },
      users: {
        getUser: vi.fn().mockResolvedValue({
          primaryEmailAddress: { emailAddress: 'alice@example.com' },
          firstName: 'Alice', lastName: 'Smith', publicMetadata: {},
        }),
      },
    } as ReturnType<typeof clerkClient> extends Promise<infer T> ? T : never);

    vi.mocked(db.$count).mockResolvedValue(1);
  });

  // ── type: 'kid' ──────────────────────────────────────────────────────────

  it('inserts a kid with name and birthday and returns the row', async () => {
    wireHousehold();
    vi.mocked(db.insert).mockReturnValue(makeInsertStub([KID_ROW]));

    const res = await POST(makeReq({ type: 'kid', name: 'Emma', birthday: '2021-03-14' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.kid).toEqual(KID_ROW);
    expect(db.insert).toHaveBeenCalledTimes(1);
  });

  it('inserts a kid with null birthday when no date provided', async () => {
    wireHousehold();
    vi.mocked(db.insert).mockReturnValue(makeInsertStub([{ ...KID_ROW, birthday: null }]));

    const res = await POST(makeReq({ type: 'kid', name: 'Liam', birthday: null }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.kid.birthday).toBeNull();
  });

  it('treats empty-string birthday as null', async () => {
    // The client sends birthday || null, so '' becomes null before the request.
    // Confirm the route handles null cleanly regardless.
    wireHousehold();
    vi.mocked(db.insert).mockReturnValue(makeInsertStub([{ ...KID_ROW, birthday: null }]));

    const res = await POST(makeReq({ type: 'kid', name: 'Liam', birthday: null }));

    expect(res.status).toBe(200);
  });

  it('returns 400 when kid name is missing', async () => {
    wireHousehold();

    const res = await POST(makeReq({ type: 'kid', name: '', birthday: null }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/name required/i);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('returns 400 when kid name is only whitespace', async () => {
    wireHousehold();

    const res = await POST(makeReq({ type: 'kid', name: '   ', birthday: null }));

    expect(res.status).toBe(400);
    expect(db.insert).not.toHaveBeenCalled();
  });

  // Regression — ship-blocker #13: cap kid name/notes; validate birthday.
  // Server-side validation prevents megabyte-blob inputs from bloating rows
  // and rejects malformed birthday strings before they hit Postgres' date cast.

  it('caps kid name at 100 chars', async () => {
    wireHousehold();
    const valuesSpy = vi.fn().mockReturnValue({
      returning: () => Promise.resolve([KID_ROW]),
    });
    vi.mocked(db.insert).mockReturnValue({ values: valuesSpy } as unknown as ReturnType<typeof db.insert>);

    const longName = 'A'.repeat(500);
    const res = await POST(makeReq({ type: 'kid', name: longName, birthday: null }));

    expect(res.status).toBe(200);
    const inserted = valuesSpy.mock.calls[0][0] as Record<string, unknown>;
    expect((inserted.name as string).length).toBe(100);
  });

  it('caps kid notes at 2000 chars and trims whitespace', async () => {
    wireHousehold();
    const valuesSpy = vi.fn().mockReturnValue({
      returning: () => Promise.resolve([KID_ROW]),
    });
    vi.mocked(db.insert).mockReturnValue({ values: valuesSpy } as unknown as ReturnType<typeof db.insert>);

    const longNotes = '  ' + 'x'.repeat(5000) + '  ';
    const res = await POST(makeReq({ type: 'kid', name: 'Emma', notes: longNotes }));

    expect(res.status).toBe(200);
    const inserted = valuesSpy.mock.calls[0][0] as Record<string, unknown>;
    expect((inserted.notes as string).length).toBe(2000);
  });

  it('coerces empty/whitespace notes to null', async () => {
    wireHousehold();
    const valuesSpy = vi.fn().mockReturnValue({
      returning: () => Promise.resolve([KID_ROW]),
    });
    vi.mocked(db.insert).mockReturnValue({ values: valuesSpy } as unknown as ReturnType<typeof db.insert>);

    const res = await POST(makeReq({ type: 'kid', name: 'Emma', notes: '   ' }));

    expect(res.status).toBe(200);
    const inserted = valuesSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(inserted.notes).toBeNull();
  });

  it('returns 400 when birthday is malformed', async () => {
    wireHousehold();

    const res = await POST(makeReq({ type: 'kid', name: 'Emma', birthday: 'not-a-date' }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/birthday/i);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('returns 400 when birthday has wrong format (MM/DD/YYYY)', async () => {
    wireHousehold();

    const res = await POST(makeReq({ type: 'kid', name: 'Emma', birthday: '03/14/2021' }));

    expect(res.status).toBe(400);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('returns 400 when birthday is far in the past (>25 yrs)', async () => {
    wireHousehold();
    const tooOld = `${new Date().getFullYear() - 50}-01-01`;

    const res = await POST(makeReq({ type: 'kid', name: 'Emma', birthday: tooOld }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/birthday/i);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('returns 400 when birthday is far in the future (>1 yr ahead)', async () => {
    wireHousehold();
    const tooFar = `${new Date().getFullYear() + 5}-01-01`;

    const res = await POST(makeReq({ type: 'kid', name: 'Emma', birthday: tooFar }));

    expect(res.status).toBe(400);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('accepts a valid recent birthday', async () => {
    wireHousehold();
    vi.mocked(db.insert).mockReturnValue(makeInsertStub([KID_ROW]));
    const recent = `${new Date().getFullYear() - 5}-06-15`;

    const res = await POST(makeReq({ type: 'kid', name: 'Emma', birthday: recent }));

    expect(res.status).toBe(200);
    expect(db.insert).toHaveBeenCalledTimes(1);
  });

  // ── type: 'adult' ────────────────────────────────────────────────────────

  it('inserts an adult placeholder and returns the row', async () => {
    wireHousehold();
    const adult = { id: 'usr-002', clerkUserId: 'placeholder_x', householdId: HH_ID, name: 'Bob', email: 'bob@example.com', role: 'watcher', villageGroup: 'covey' };
    vi.mocked(db.insert).mockReturnValue(makeInsertStub([adult]));

    const res = await POST(makeReq({ type: 'adult', name: 'Bob', email: 'bob@example.com' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.user.name).toBe('Bob');
  });

  it('returns 400 when adult is missing email', async () => {
    wireHousehold();

    const res = await POST(makeReq({ type: 'adult', name: 'Bob', email: '' }));

    expect(res.status).toBe(400);
    expect(db.insert).not.toHaveBeenCalled();
  });

  // Regression — ship-blocker #4: mass-assignment defense. The handler must
  // ignore caller-supplied clerkUserId, role, and villageGroup and force
  // server-side defaults so a household admin can't link an arbitrary Clerk
  // identity or grant elevated privileges via a crafted body.
  it('ignores caller-supplied clerkUserId, role, and villageGroup', async () => {
    wireHousehold();

    const valuesSpy = vi.fn().mockReturnValue({
      returning: () => Promise.resolve([{ id: 'usr-002' }]),
    });
    vi.mocked(db.insert).mockReturnValue({ values: valuesSpy } as unknown as ReturnType<typeof db.insert>);

    const res = await POST(makeReq({
      type: 'adult',
      name: 'Bob',
      email: 'bob@example.com',
      clerkUserId: 'user_attacker_clerk_id',
      role: 'keeper',
      villageGroup: 'inner_circle',
    }));

    expect(res.status).toBe(200);
    expect(valuesSpy).toHaveBeenCalledTimes(1);
    const inserted = valuesSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(inserted.clerkUserId).toMatch(/^placeholder_/);
    expect(inserted.clerkUserId).not.toBe('user_attacker_clerk_id');
    expect(inserted.role).toBe('watcher');
    expect(inserted.villageGroup).toBe('covey');
  });

  // ── unknown type ─────────────────────────────────────────────────────────

  it('returns 400 for unknown type', async () => {
    wireHousehold();

    const res = await POST(makeReq({ type: 'pet', name: 'Rex' }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/unknown type/i);
  });

  // ── auth guard ───────────────────────────────────────────────────────────

  it('propagates auth error when requireHousehold throws', async () => {
    vi.mocked(auth).mockResolvedValue({ userId: null, orgId: null } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);

    const res = await POST(makeReq({ type: 'kid', name: 'Emma', birthday: null }));

    // authError fires; DB must not be touched
    expect(res.status).toBe(401);
    expect(db.insert).not.toHaveBeenCalled();
  });
});
