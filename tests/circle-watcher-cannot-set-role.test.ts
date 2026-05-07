/**
 * Bug #5 (BUGS.md 2026-05-06) — Watchers can choose role/circle when inviting.
 *
 * Spec: only keepers/admins assign appRole + villageGroup. Watchers' invite
 * path is "invite a new family" — server forces appRole='keeper',
 * householdMode='create_new'. Payload overrides MUST be ignored.
 *
 * UI hides the selectors, but we test server-side because UI gating alone is
 * not enforcement (a forged payload could bypass it).
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
const USER_ID = 'watcher-1';

function mockWatcherHousehold() {
  vi.mocked(requireHousehold).mockResolvedValue({
    household: { id: HH_ID, clerkOrgId: 'org_1' },
    user: { id: USER_ID, clerkUserId: 'clerk_w', householdId: HH_ID, role: 'watcher', isAdmin: false },
    userId: 'clerk_w',
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

describe('Bug #5 — watcher inviter cannot set role/villageGroup', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('watcher payload with appRole=keeper villageGroup=field → server forces keeper + create_new', async () => {
    mockWatcherHousehold();
    const { chain, captured } = makeInsertCapture();
    vi.mocked(db.insert).mockReturnValue(chain as unknown as ReturnType<typeof db.insert>);

    const res = await invitePost(makeReq({
      parentName: 'NewFamilyKeeper',
      parentEmail: 'newfam@example.com',
      // Forged overrides — should all be ignored.
      appRole: 'watcher',
      villageGroup: 'field',
      mode: 'link',
    }));

    expect(res.status).toBe(200);
    expect(captured).toHaveLength(1);
    expect(captured[0].appRole).toBe('keeper');
    expect(captured[0].householdMode).toBe('create_new');
  });

  it('watcher with no payload role → still create_new with appRole=keeper', async () => {
    mockWatcherHousehold();
    const { chain, captured } = makeInsertCapture();
    vi.mocked(db.insert).mockReturnValue(chain as unknown as ReturnType<typeof db.insert>);

    const res = await invitePost(makeReq({
      parentName: 'CleanFamily',
      parentEmail: 'clean@example.com',
      mode: 'email',
    }));

    expect(res.status).toBe(200);
    expect(captured[0].appRole).toBe('keeper');
    expect(captured[0].householdMode).toBe('create_new');
  });

  it('watcher with garbage appRole value → still forced to keeper, not 400', async () => {
    // Watcher path bypasses validation (the value is ignored anyway). Document
    // the behavior so a future "tighten validation" change doesn't accidentally
    // start 400'ing legitimate watcher invites with malformed legacy payloads.
    mockWatcherHousehold();
    const { chain, captured } = makeInsertCapture();
    vi.mocked(db.insert).mockReturnValue(chain as unknown as ReturnType<typeof db.insert>);

    const res = await invitePost(makeReq({
      parentName: 'X',
      parentEmail: 'x@example.com',
      appRole: 'admin', // not a valid enum value, but ignored on watcher path
      mode: 'link',
    }));

    expect(res.status).toBe(200);
    expect(captured[0].appRole).toBe('keeper');
  });
});
