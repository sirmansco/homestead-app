/**
 * Bug #4 (BUGS.md 2026-05-06) — Profile photo edit permissions wrong/unenforced.
 *
 * Matrix from docs/plans/circle-invite-role-audit.md §2.4:
 *
 *   | Viewer  | Own | Other keeper | Chick (same hh) | Watcher |
 *   |---------|-----|--------------|-----------------|---------|
 *   | keeper  | ✓   | ✗            | ✓               | ✗       |
 *   | watcher | ✓   | ✗            | ✗               | ✗       |
 *
 * Server-side enforcement at /api/upload. Reject 403 on disallowed cells.
 * UI hiding is not enforcement — a forged form-data POST could bypass it.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('@/lib/auth/household', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth/household')>('@/lib/auth/household');
  return {
    ...actual,
    requireHousehold: vi.fn(),
  };
});

vi.mock('@/lib/ratelimit', () => ({
  rateLimit: vi.fn().mockReturnValue({ limited: false }),
  rateLimitResponse: vi.fn().mockReturnValue(null),
}));

vi.mock('@vercel/blob', () => ({
  put: vi.fn().mockResolvedValue({ url: 'https://blob.example/test.jpg' }),
}));

vi.mock('@/lib/strip-exif', () => ({
  stripExif: (buf: Buffer) => buf,
}));

vi.mock('@/lib/upload/sniff', () => ({
  verifyImageMagicBytes: () => ({ ok: true, mime: 'image/jpeg' }),
}));

import { requireHousehold } from '@/lib/auth/household';
import { db } from '@/lib/db';
import { POST as uploadPost } from '@/app/api/upload/route';

const HH_A = 'hh-a';
const HH_B = 'hh-b';
const KEEPER_1 = 'keeper-1';
const KEEPER_2 = 'keeper-2';
const WATCHER_1 = 'watcher-1';
const WATCHER_2 = 'watcher-2';
const CHICK_A1 = 'chick-a1';
const CHICK_B1 = 'chick-b1'; // chick in OTHER household

type Row = Record<string, unknown>;

function mockViewer(role: 'keeper' | 'watcher', userId: string, householdId = HH_A) {
  vi.mocked(requireHousehold).mockResolvedValue({
    household: { id: householdId, clerkOrgId: 'org_1' },
    user: { id: userId, clerkUserId: `clerk_${userId}`, householdId, role, isAdmin: false },
    userId: `clerk_${userId}`,
    orgId: 'org_1',
  } as unknown as Awaited<ReturnType<typeof requireHousehold>>);
}

function makeSelectChain(rows: Row[]) {
  const chain: Record<string, unknown> = {};
  const t = () => chain;
  chain['from'] = t; chain['where'] = t; chain['limit'] = t;
  chain['then'] = (resolve: (v: unknown) => void) => { resolve(rows); return chain; };
  chain['catch'] = () => chain; chain['finally'] = () => chain;
  return chain;
}

function makeUpdateChain() {
  const chain: Record<string, unknown> = {};
  const t = () => chain;
  chain['set'] = t; chain['where'] = t; chain['returning'] = t;
  chain['then'] = (resolve: (v: unknown) => void) => { resolve([]); return chain; };
  chain['catch'] = () => chain; chain['finally'] = () => chain;
  return chain;
}

function makeReq(targetType: 'user' | 'kid', targetId: string) {
  const form = new FormData();
  form.append('file', new File([Buffer.from('fake-jpeg-bytes-here-padded-out-to-some-length')], 'test.jpg', { type: 'image/jpeg' }));
  form.append('type', targetType);
  form.append('id', targetId);
  return {
    formData: () => Promise.resolve(form),
  } as unknown as Parameters<typeof uploadPost>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.BLOB_READ_WRITE_TOKEN = 'test-token';
});

describe('Bug #4 — photo edit permissions (matrix §2.4)', () => {
  describe('keeper viewer', () => {
    it('keeper editing OWN photo → 200', async () => {
      mockViewer('keeper', KEEPER_1);
      vi.mocked(db.update).mockReturnValue(makeUpdateChain() as unknown as ReturnType<typeof db.update>);
      const res = await uploadPost(makeReq('user', KEEPER_1));
      expect(res.status).toBe(200);
    });

    it('keeper editing OTHER KEEPER photo → 403', async () => {
      mockViewer('keeper', KEEPER_1);
      vi.mocked(db.update).mockReturnValue(makeUpdateChain() as unknown as ReturnType<typeof db.update>);
      const res = await uploadPost(makeReq('user', KEEPER_2));
      expect(res.status).toBe(403);
      expect(vi.mocked(db.update)).not.toHaveBeenCalled();
    });

    it('keeper editing WATCHER photo → 403', async () => {
      mockViewer('keeper', KEEPER_1);
      vi.mocked(db.update).mockReturnValue(makeUpdateChain() as unknown as ReturnType<typeof db.update>);
      const res = await uploadPost(makeReq('user', WATCHER_1));
      expect(res.status).toBe(403);
    });

    it('keeper editing CHICK in own household → 200', async () => {
      mockViewer('keeper', KEEPER_1);
      vi.mocked(db.select).mockReturnValue(
        makeSelectChain([{ id: CHICK_A1, householdId: HH_A }]) as unknown as ReturnType<typeof db.select>,
      );
      vi.mocked(db.update).mockReturnValue(makeUpdateChain() as unknown as ReturnType<typeof db.update>);
      const res = await uploadPost(makeReq('kid', CHICK_A1));
      expect(res.status).toBe(200);
    });

    it('keeper editing CHICK in OTHER household → 403', async () => {
      mockViewer('keeper', KEEPER_1, HH_A);
      vi.mocked(db.select).mockReturnValue(
        makeSelectChain([{ id: CHICK_B1, householdId: HH_B }]) as unknown as ReturnType<typeof db.select>,
      );
      vi.mocked(db.update).mockReturnValue(makeUpdateChain() as unknown as ReturnType<typeof db.update>);
      const res = await uploadPost(makeReq('kid', CHICK_B1));
      expect(res.status).toBe(403);
    });
  });

  describe('watcher viewer', () => {
    it('watcher editing OWN photo → 200', async () => {
      mockViewer('watcher', WATCHER_1);
      vi.mocked(db.update).mockReturnValue(makeUpdateChain() as unknown as ReturnType<typeof db.update>);
      const res = await uploadPost(makeReq('user', WATCHER_1));
      expect(res.status).toBe(200);
    });

    it('watcher editing KEEPER photo → 403', async () => {
      mockViewer('watcher', WATCHER_1);
      const res = await uploadPost(makeReq('user', KEEPER_1));
      expect(res.status).toBe(403);
    });

    it('watcher editing OTHER WATCHER photo → 403', async () => {
      mockViewer('watcher', WATCHER_1);
      const res = await uploadPost(makeReq('user', WATCHER_2));
      expect(res.status).toBe(403);
    });

    it('watcher editing ANY chick → 403', async () => {
      mockViewer('watcher', WATCHER_1);
      vi.mocked(db.select).mockReturnValue(
        makeSelectChain([{ id: CHICK_A1, householdId: HH_A }]) as unknown as ReturnType<typeof db.select>,
      );
      const res = await uploadPost(makeReq('kid', CHICK_A1));
      expect(res.status).toBe(403);
    });
  });
});
