/**
 * Bug #1 (BUGS.md 2026-05-06) — Settings invite assigns wrong role.
 *
 * Three-part root cause:
 *  (a) family_invites had no app_role column — fixed by migration 0018.
 *  (b) ScreenCircle.tsx caregiverMode payload omits role — UI fix.
 *  (c) requireHousehold() defaults to 'watcher' when meta.appRole is undefined.
 *
 * This test locks the route side: when a keeper POSTs an invite with appRole,
 * the row is persisted with that appRole. The accept route then surfaces it
 * to Clerk metadata so requireHousehold() picks the right role on first load.
 *
 * Pattern: mocks @/lib/db at module scope (matches invite-family-correctness.test.ts).
 */

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

import { requireHousehold } from '@/lib/auth/household';
import { db } from '@/lib/db';
import { POST as invitePost } from '@/app/api/circle/invite-family/route';

const HH_ID = 'hh-1';
const USER_ID = 'user-1';
const CLERK_ID = 'clerk_1';
const INVITE_EMAIL = 'parent@example.com';

function mockKeeperHousehold() {
  vi.mocked(requireHousehold).mockResolvedValue({
    household: { id: HH_ID, clerkOrgId: 'org_1' },
    user: { id: USER_ID, clerkUserId: CLERK_ID, householdId: HH_ID, role: 'keeper', isAdmin: true },
    userId: CLERK_ID,
    orgId: 'org_1',
  } as unknown as Awaited<ReturnType<typeof requireHousehold>>);
}

function makeInsertCapture() {
  const captured: Record<string, unknown>[] = [];
  const chain: Record<string, unknown> = {};
  const t = () => chain;
  chain['values'] = (vals: Record<string, unknown>) => {
    captured.push(vals);
    return chain;
  };
  chain['returning'] = t;
  chain['then'] = (resolve: (v: unknown) => void) => { resolve([]); return chain; };
  chain['catch'] = () => chain; chain['finally'] = () => chain;
  return { chain, captured };
}

function makeReq(body: unknown) {
  return {
    json: () => Promise.resolve(body),
    headers: { get: () => 'http://localhost' },
    url: 'http://localhost/api/circle/invite-family',
    nextUrl: { searchParams: new URLSearchParams() },
  } as unknown as Parameters<typeof invitePost>[0];
}

describe('Bug #1 — invite role persists on the family_invites row', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('keeper invite with appRole=keeper → persists appRole=keeper', async () => {
    mockKeeperHousehold();
    const { chain, captured } = makeInsertCapture();
    vi.mocked(db.insert).mockReturnValue(chain as unknown as ReturnType<typeof db.insert>);

    const res = await invitePost(makeReq({
      parentName: 'Alice',
      parentEmail: INVITE_EMAIL,
      villageGroup: 'covey',
      appRole: 'keeper',
      mode: 'link',
    }));

    expect(res.status).toBe(200);
    expect(captured).toHaveLength(1);
    expect(captured[0].appRole).toBe('keeper');
    expect(captured[0].villageGroup).toBe('covey');
    expect(captured[0].householdMode).toBe('join_existing');
  });

  it('keeper invite with appRole=watcher → persists appRole=watcher', async () => {
    mockKeeperHousehold();
    const { chain, captured } = makeInsertCapture();
    vi.mocked(db.insert).mockReturnValue(chain as unknown as ReturnType<typeof db.insert>);

    const res = await invitePost(makeReq({
      parentName: 'Bob',
      parentEmail: INVITE_EMAIL,
      villageGroup: 'field',
      appRole: 'watcher',
      mode: 'email',
    }));

    expect(res.status).toBe(200);
    expect(captured[0].appRole).toBe('watcher');
    expect(captured[0].villageGroup).toBe('field');
    expect(captured[0].householdMode).toBe('join_existing');
  });

  it('keeper invite with no appRole → rejects 400 (was the silent default)', async () => {
    mockKeeperHousehold();
    const { chain } = makeInsertCapture();
    vi.mocked(db.insert).mockReturnValue(chain as unknown as ReturnType<typeof db.insert>);

    const res = await invitePost(makeReq({
      parentName: 'Carol',
      parentEmail: INVITE_EMAIL,
      villageGroup: 'covey',
      mode: 'link',
    }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/appRole/i);
  });

  it('keeper invite with invalid appRole → 400', async () => {
    mockKeeperHousehold();
    const { chain } = makeInsertCapture();
    vi.mocked(db.insert).mockReturnValue(chain as unknown as ReturnType<typeof db.insert>);

    const res = await invitePost(makeReq({
      parentName: 'Dave',
      parentEmail: INVITE_EMAIL,
      villageGroup: 'covey',
      appRole: 'admin', // not a valid app_role enum value
      mode: 'link',
    }));

    expect(res.status).toBe(400);
  });
});
