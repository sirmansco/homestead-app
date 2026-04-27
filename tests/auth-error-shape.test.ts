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
  },
}));

vi.mock('@/lib/format', () => ({
  looksLikeSlug: vi.fn().mockReturnValue(false),
  normaliseStoredName: (s: string) => s,
}));

// notify is dynamically imported by some routes; stub eagerly so route imports don't fail.
vi.mock('@/lib/notify', () => ({
  notifyNewShift: vi.fn(),
  notifyShiftClaimed: vi.fn(),
  notifyShiftReleased: vi.fn(),
  notifyShiftCancelled: vi.fn(),
  notifyBellResponse: vi.fn(),
  notifyBellRing: vi.fn(),
  notifyBellEscalated: vi.fn(),
}));

vi.mock('@/lib/ratelimit', () => ({
  rateLimit: vi.fn().mockReturnValue({ ok: true, remaining: 9, resetAt: Date.now() + 3600000, retryAfterMs: 0 }),
  rateLimitResponse: vi.fn().mockReturnValue(null),
}));

// push/test route imports lib/push directly (allowlisted diagnostic); stub so
// the route can be imported without VAPID env vars present.
vi.mock('@/lib/push', () => ({
  pushToUser: vi.fn(),
  pushToUsers: vi.fn(),
  pushToHousehold: vi.fn(),
  pushToHouseholdCaregivers: vi.fn(),
}));

// Real next/server response so .json() and .status round-trip realistically.
// Avoid stubbing here — we want to assert the actual body shape `authError()` produces.

import { auth } from '@clerk/nextjs/server';

// ── Import every user-auth route handler under test ──────────────────────────

import * as villageRoute from '@/app/api/village/route';
import * as villageInviteRoute from '@/app/api/village/invite/route';
import * as villageInviteFamilyRoute from '@/app/api/village/invite-family/route';
import * as householdRoute from '@/app/api/household/route';
import * as householdMembersRoute from '@/app/api/household/members/route';
import * as householdMemberItemRoute from '@/app/api/household/members/[id]/route';
import * as feedbackRoute from '@/app/api/feedback/route';
import * as shiftsRoute from '@/app/api/shifts/route';
import * as shiftClaimRoute from '@/app/api/shifts/[id]/claim/route';
import * as shiftUnclaimRoute from '@/app/api/shifts/[id]/unclaim/route';
import * as shiftCancelRoute from '@/app/api/shifts/[id]/cancel/route';
import * as bellRoute from '@/app/api/bell/route';
import * as bellItemRoute from '@/app/api/bell/[id]/route';
import * as bellRespondRoute from '@/app/api/bell/[id]/respond/route';
import * as bellEscalateRoute from '@/app/api/bell/[id]/escalate/route';
import * as bellActiveRoute from '@/app/api/bell/active/route';
import * as unavailabilityRoute from '@/app/api/unavailability/route';
import * as accountRoute from '@/app/api/account/route';
import * as notificationsRoute from '@/app/api/notifications/route';
import * as uploadRoute from '@/app/api/upload/route';
import * as pushSubscribeRoute from '@/app/api/push/subscribe/route';
import * as pushTestRoute from '@/app/api/push/test/route';

// ── Test helpers ─────────────────────────────────────────────────────────────

type FakeReq = {
  url: string;
  nextUrl: URL;
  headers: Map<string, string>;
  json: () => Promise<unknown>;
};

type FakeCtx = { params: Promise<{ id: string }> };

type FakeRes = { status: number; json: () => Promise<unknown> };

type Handler = (req: FakeReq, ctx?: FakeCtx) => Promise<FakeRes>;

function fakeReq(url = 'http://localhost/api/test'): FakeReq {
  const u = new URL(url);
  return {
    url,
    nextUrl: u,
    headers: new Map<string, string>(),
    json: async () => ({}),
  };
}

function fakeCtxWithId(): FakeCtx {
  return { params: Promise.resolve({ id: '00000000-0000-0000-0000-000000000000' }) };
}

async function expectUnauthShape(handler: Handler, req: FakeReq, ctx?: FakeCtx) {
  const res = await handler(req, ctx);
  expect(res.status).toBe(401);
  const body = await res.json();
  expect(body).toEqual({ error: 'not_signed_in' });
}

// ── Cases: every user-auth (handler, args) we want under contract ────────────

const cases: Array<{
  name: string;
  handler: Handler;
  needsCtx?: boolean;
  url?: string;
}> = [
  { name: 'GET /api/village (scope=household)', handler: villageRoute.GET as unknown as Handler },
  { name: 'GET /api/village (scope=all)', handler: villageRoute.GET as unknown as Handler, url: 'http://localhost/api/village?scope=all' },
  { name: 'POST /api/village', handler: villageRoute.POST as unknown as Handler },
  { name: 'PATCH /api/village', handler: (villageRoute as Record<string, unknown>).PATCH as unknown as Handler },
  { name: 'POST /api/village/invite', handler: villageInviteRoute.POST as unknown as Handler },
  { name: 'POST /api/village/invite-family', handler: villageInviteFamilyRoute.POST as unknown as Handler },
  { name: 'GET /api/household', handler: householdRoute.GET as unknown as Handler },
  { name: 'PATCH /api/household', handler: householdRoute.PATCH as unknown as Handler },
  { name: 'POST /api/household', handler: (householdRoute as Record<string, unknown>).POST as unknown as Handler },
  { name: 'GET /api/household/members', handler: householdMembersRoute.GET as unknown as Handler },
  { name: 'PATCH /api/household/members/[id]', handler: householdMemberItemRoute.PATCH as unknown as Handler, needsCtx: true },
  { name: 'DELETE /api/household/members/[id]', handler: (householdMemberItemRoute as Record<string, unknown>).DELETE as unknown as Handler, needsCtx: true },
  { name: 'POST /api/feedback', handler: feedbackRoute.POST as unknown as Handler },
  { name: 'GET /api/shifts (scope=household)', handler: shiftsRoute.GET as unknown as Handler },
  { name: 'GET /api/shifts (scope=all)', handler: shiftsRoute.GET as unknown as Handler, url: 'http://localhost/api/shifts?scope=all' },
  { name: 'GET /api/shifts (scope=mine)', handler: shiftsRoute.GET as unknown as Handler, url: 'http://localhost/api/shifts?scope=mine' },
  { name: 'POST /api/shifts', handler: shiftsRoute.POST as unknown as Handler },
  { name: 'POST /api/shifts/[id]/claim', handler: shiftClaimRoute.POST as unknown as Handler, needsCtx: true },
  { name: 'POST /api/shifts/[id]/unclaim', handler: shiftUnclaimRoute.POST as unknown as Handler, needsCtx: true },
  { name: 'POST /api/shifts/[id]/cancel', handler: shiftCancelRoute.POST as unknown as Handler, needsCtx: true },
  { name: 'GET /api/bell', handler: bellRoute.GET as unknown as Handler },
  { name: 'POST /api/bell', handler: bellRoute.POST as unknown as Handler },
  { name: 'PATCH /api/bell/[id]', handler: (bellItemRoute as Record<string, unknown>).PATCH as unknown as Handler, needsCtx: true },
  { name: 'POST /api/bell/[id]/respond', handler: bellRespondRoute.POST as unknown as Handler, needsCtx: true },
  { name: 'POST /api/bell/[id]/escalate', handler: bellEscalateRoute.POST as unknown as Handler, needsCtx: true },
  { name: 'GET /api/bell/active', handler: bellActiveRoute.GET as unknown as Handler },
  { name: 'GET /api/unavailability', handler: unavailabilityRoute.GET as unknown as Handler },
  { name: 'POST /api/unavailability', handler: unavailabilityRoute.POST as unknown as Handler },
  { name: 'DELETE /api/unavailability', handler: unavailabilityRoute.DELETE as unknown as Handler },
  { name: 'GET /api/account', handler: accountRoute.GET as unknown as Handler },
  { name: 'DELETE /api/account', handler: accountRoute.DELETE as unknown as Handler, url: 'http://localhost/api/account?confirm=yes-delete-my-data' },
  { name: 'GET /api/notifications', handler: notificationsRoute.GET as unknown as Handler },
  { name: 'PATCH /api/notifications', handler: notificationsRoute.PATCH as unknown as Handler },
  { name: 'POST /api/upload', handler: uploadRoute.POST as unknown as Handler },
  { name: 'POST /api/push/subscribe', handler: pushSubscribeRoute.POST as unknown as Handler },
  { name: 'POST /api/push/test', handler: pushTestRoute.POST as unknown as Handler },
];

// ── The actual contract test ─────────────────────────────────────────────────

describe('auth error shape contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set BLOB token so /api/upload doesn't 503 before reaching the auth check —
    // we want the auth-shape contract verified, not the env-availability guard.
    process.env.BLOB_READ_WRITE_TOKEN = 'test-blob-token';
    // Unauthenticated session — every handler should reject with not_signed_in.
    vi.mocked(auth).mockResolvedValue({
      userId: null,
      orgId: null,
    } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);
  });

  for (const c of cases) {
    if (typeof c.handler !== 'function') {
      // Some routes don't export every method (e.g. household has no DELETE) — skip cleanly.
      continue;
    }
    it(`${c.name} → 401 { error: 'not_signed_in' }`, async () => {
      await expectUnauthShape(c.handler, fakeReq(c.url), c.needsCtx ? fakeCtxWithId() : undefined);
    });
  }
});
