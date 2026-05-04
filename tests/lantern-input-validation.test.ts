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

// notifyLanternLit fans out to push subscriptions; stub it so the route
// returns cleanly for valid-payload assertions.
vi.mock('@/lib/notify', () => ({
  notifyLanternLit: vi.fn().mockResolvedValue({ kind: 'sent', recipients: 1 }),
}));

vi.mock('@/lib/ratelimit', () => ({
  rateLimit: vi.fn().mockReturnValue({ ok: true, remaining: 2, resetMs: 0 }),
  rateLimitResponse: vi.fn().mockReturnValue(null),
  clientIp: vi.fn().mockReturnValue('127.0.0.1'),
}));

// ── Imports after mocks ───────────────────────────────────────────────────────

import { POST } from '@/app/api/lantern/route';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { db } from '@/lib/db';

// ── Constants ────────────────────────────────────────────────────────────────

const CLERK_USER_ID = 'user_clerk_1';
const CLERK_ORG_ID  = 'org_clerk_1';
const HH_ID         = 'hh-uuid-001';
const USER_ID       = 'usr-uuid-001';

const HOUSEHOLD_ROW = { id: HH_ID, clerkOrgId: CLERK_ORG_ID, name: 'Smith Family', glyph: '🏡' };
const USER_ROW = {
  id: USER_ID, clerkUserId: CLERK_USER_ID, householdId: HH_ID,
  email: 'alice@example.com', name: 'Alice Smith',
  role: 'keeper', villageGroup: 'covey', isAdmin: true,
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

function makeReq(body: unknown) {
  return new NextRequest('http://localhost/api/lantern', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

function wireHousehold() {
  vi.mocked(db.select)
    .mockReturnValueOnce(makeSelectStub([HOUSEHOLD_ROW]))
    .mockReturnValueOnce(makeSelectStub([USER_ROW]));
}

// Future-dated start/end so parseTimeRange accepts the window
const startsAt = new Date(Date.now() + 60_000).toISOString();
const endsAt   = new Date(Date.now() + 60 * 60_000).toISOString();

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/lantern — input validation', () => {
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
  });

  // Ship-blocker #5 — reason allowlist: arbitrary strings must be rejected so
  // they can't land in DB rows or push-notification bodies.
  it('rejects reason not in canonical allowlist', async () => {
    wireHousehold();

    const res = await POST(makeReq({
      reason: 'arbitrary attacker text',
      startsAt, endsAt,
    }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/invalid reason/i);
    expect(db.insert).not.toHaveBeenCalled();
  });

  // Ship-blocker #5 — note length cap: prevents row bloat and oversize
  // notification payloads.
  it('rejects note longer than 500 chars', async () => {
    wireHousehold();

    const res = await POST(makeReq({
      reason: 'Sick kid',
      note: 'x'.repeat(501),
      startsAt, endsAt,
    }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/500 characters/i);
    expect(db.insert).not.toHaveBeenCalled();
  });

  // Whitespace doesn't count toward the cap — trim before length check.
  it('trims whitespace before applying length cap', async () => {
    wireHousehold();
    const valuesSpy = vi.fn().mockReturnValue({
      returning: () => Promise.resolve([{ id: 'lan-001', reason: 'Sick kid', note: 'short note' }]),
    });
    vi.mocked(db.insert).mockReturnValue({ values: valuesSpy } as unknown as ReturnType<typeof db.insert>);

    // 10 real chars, 600 trailing spaces — should pass after trim
    const res = await POST(makeReq({
      reason: 'Sick kid',
      note: 'short note' + ' '.repeat(600),
      startsAt, endsAt,
    }));

    expect(res.status).toBe(200);
    expect(valuesSpy).toHaveBeenCalledTimes(1);
    const inserted = valuesSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(inserted.note).toBe('short note');
  });

  // Sanity: a valid request still passes end-to-end.
  it('accepts a valid reason + short note', async () => {
    wireHousehold();
    const valuesSpy = vi.fn().mockReturnValue({
      returning: () => Promise.resolve([{ id: 'lan-002', reason: 'Last-minute conflict' }]),
    });
    vi.mocked(db.insert).mockReturnValue({ values: valuesSpy } as unknown as ReturnType<typeof db.insert>);

    const res = await POST(makeReq({
      reason: 'Last-minute conflict',
      note: 'meeting ran over',
      startsAt, endsAt,
    }));

    expect(res.status).toBe(200);
    expect(valuesSpy).toHaveBeenCalledTimes(1);
    const inserted = valuesSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(inserted.reason).toBe('Last-minute conflict');
    expect(inserted.note).toBe('meeting ran over');
  });

  // All three canonical reasons must pass.
  it.each(['Sick kid', 'Last-minute conflict', 'Other'])(
    'accepts canonical reason: %s',
    async (reason) => {
      wireHousehold();
      vi.mocked(db.insert).mockReturnValue({
        values: () => ({ returning: () => Promise.resolve([{ id: 'lan-x', reason }]) }),
      } as unknown as ReturnType<typeof db.insert>);

      const res = await POST(makeReq({ reason, startsAt, endsAt }));
      expect(res.status).toBe(200);
    },
  );
});
