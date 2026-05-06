import { describe, it, expect, vi, beforeEach } from 'vitest';

// C3 regression: lantern/respond uses requireHousehold (not requireUser),
// and rejects with 403 when the caller's active household doesn't match
// the lantern's. Previously the route auto-created a users row in any
// household the caller was a Clerk-org member of — too permissive.

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('next/server', () => ({
  NextRequest: class {
    constructor(public url: string, private init: RequestInit = {}) {}
    get nextUrl() { return new URL(this.url); }
    async json() { return JSON.parse(this.init.body as string); }
    headers = { get: () => null };
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
  authError: () => ({
    _body: { error: 'auth_error' }, status: 401, json: async () => ({ error: 'auth_error' }),
  }),
}));

vi.mock('@/lib/notify', () => ({
  notifyLanternResponse: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/lantern-escalation', () => ({
  escalateLantern: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/auth/household', () => ({
  requireHousehold: vi.fn(),
}));

import { POST } from '@/app/api/lantern/[id]/respond/route';
import { db } from '@/lib/db';
import { requireHousehold } from '@/lib/auth/household';

const LANTERN_ID = '11111111-2222-3333-4444-555555555555';
const LANTERN_HOUSEHOLD = 'hh-uuid-lantern';
const OTHER_HOUSEHOLD = 'hh-uuid-other';

const ringingLantern = () => ({
  id: LANTERN_ID,
  householdId: LANTERN_HOUSEHOLD,
  status: 'ringing' as const,
  handledByUserId: null,
  escalatedAt: null,
  createdAt: new Date(),
});

function selectStub(rows: unknown[]) {
  const c: Record<string, unknown> = {};
  const t = () => c;
  c.from = t; c.where = t; c.limit = t; c.innerJoin = t;
  c.then = (r: (v: unknown) => void) => { r(rows); return c; };
  c.catch = () => c; c.finally = () => c;
  return c;
}

function reqWith(body: unknown) {
  return {
    url: `http://localhost/api/lantern/${LANTERN_ID}/respond`,
    headers: { get: () => null },
    json: async () => body,
  } as unknown as Parameters<typeof POST>[0];
}

const params = Promise.resolve({ id: LANTERN_ID });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('C3 — lantern/respond requires matching active household', () => {
  it('returns 403 when active household differs from lantern household', async () => {
    vi.mocked(requireHousehold).mockResolvedValue({
      user: { id: 'usr-x', clerkUserId: 'clerk-x', householdId: OTHER_HOUSEHOLD, role: 'watcher', villageGroup: 'covey' },
      household: { id: OTHER_HOUSEHOLD },
      userId: 'clerk-x',
      orgId: 'org-other',
    } as Awaited<ReturnType<typeof requireHousehold>>);

    vi.mocked(db.select).mockReturnValue(selectStub([ringingLantern()]) as unknown as ReturnType<typeof db.select>);

    const res = await POST(reqWith({ response: 'on_my_way' }), { params });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('no_access');
    // Must NOT have attempted to write a response or claim the lantern.
    expect(db.update).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('source-grep: route imports requireHousehold, NOT requireUser', async () => {
    const { readFileSync } = await import('node:fs');
    const path = await import('node:path');
    const src = readFileSync(
      path.resolve(__dirname, '..', 'app/api/lantern/[id]/respond/route.ts'),
      'utf-8',
    );
    expect(src).toMatch(/import\s+\{\s*requireHousehold\s*\}\s+from\s+['"]@\/lib\/auth\/household['"]/);
    expect(src).not.toMatch(/import\s+\{[^}]*\brequireUser\b[^}]*\}\s+from\s+['"]@\/lib\/auth\/household['"]/);
  });
});
