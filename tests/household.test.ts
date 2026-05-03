import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks must be declared before the module under test is imported ──────────

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
}));

// ── Import after mocks ───────────────────────────────────────────────────────
import { requireHousehold } from '@/lib/auth/household';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { db } from '@/lib/db';

// ── Constants ────────────────────────────────────────────────────────────────
const CLERK_USER_ID = 'user_clerk_1';
const CLERK_ORG_ID = 'org_clerk_1';
const HH_ID = 'hh-uuid-001';
const USER_ID = 'usr-uuid-001';

const HOUSEHOLD_ROW = { id: HH_ID, clerkOrgId: CLERK_ORG_ID, name: 'Smith Family', glyph: '🏡' };
const USER_ROW = {
  id: USER_ID,
  clerkUserId: CLERK_USER_ID,
  householdId: HH_ID,
  email: 'alice@example.com',
  name: 'Alice Smith',
  role: 'keeper',
  villageGroup: 'covey',
};

// ── Drizzle chain builders ───────────────────────────────────────────────────

// Chainable select stub that resolves to `rows`.
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

// Chainable insert stub — onConflictDoNothing() returns the same chain, then resolves.
function makeInsertStub(rows: unknown[] = []) {
  const chain: Record<string, unknown> = {};
  const terminal = () => chain;
  chain['values']              = terminal;
  chain['onConflictDoNothing'] = terminal;
  chain['returning']           = terminal;
  chain['then']    = (resolve: (v: unknown) => void) => { resolve(rows); return chain; };
  chain['catch']   = () => chain;
  chain['finally'] = () => chain;
  return chain;
}

// ── Clerk stubs ──────────────────────────────────────────────────────────────

function makeClerkClient(overrides: Record<string, unknown> = {}) {
  return {
    organizations: {
      getOrganization: vi.fn().mockResolvedValue({ id: CLERK_ORG_ID, name: 'Smith Family' }),
    },
    users: {
      getUser: vi.fn().mockResolvedValue({
        primaryEmailAddress: { emailAddress: 'alice@example.com' },
        firstName: 'Alice',
        lastName: 'Smith',
        publicMetadata: {},
      }),
    },
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('requireHousehold()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue({
      userId: CLERK_USER_ID,
      orgId: CLERK_ORG_ID,
    } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);
    vi.mocked(clerkClient).mockResolvedValue(makeClerkClient() as ReturnType<typeof clerkClient> extends Promise<infer T> ? T : never);
  });

  it('throws "Not signed in" when userId is null', async () => {
    vi.mocked(auth).mockResolvedValue({ userId: null, orgId: null } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);
    await expect(requireHousehold()).rejects.toThrow('Not signed in');
  });

  it('throws "No active household" when orgId is null', async () => {
    vi.mocked(auth).mockResolvedValue({ userId: CLERK_USER_ID, orgId: null } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);
    await expect(requireHousehold()).rejects.toThrow('No active household');
  });

  it('returns existing household and user without any inserts', async () => {
    // household found on first select, user found on second select
    vi.mocked(db.select)
      .mockReturnValueOnce(makeSelectStub([HOUSEHOLD_ROW]))
      .mockReturnValueOnce(makeSelectStub([USER_ROW]));

    const result = await requireHousehold();

    expect(result.household).toEqual(HOUSEHOLD_ROW);
    expect(result.user).toEqual(USER_ROW);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('creates household row when none exists, then finds user', async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce(makeSelectStub([]))          // household: not found
      .mockReturnValueOnce(makeSelectStub([HOUSEHOLD_ROW])) // household: re-fetch after insert
      .mockReturnValueOnce(makeSelectStub([USER_ROW])); // user: found

    vi.mocked(db.insert).mockReturnValue(makeInsertStub());

    const result = await requireHousehold();

    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(result.household.id).toBe(HH_ID);
    expect(result.user.id).toBe(USER_ID);
  });

  it('creates user row when household exists but user does not', async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce(makeSelectStub([HOUSEHOLD_ROW])) // household: found
      .mockReturnValueOnce(makeSelectStub([]))              // user: not found
      .mockReturnValueOnce(makeSelectStub([USER_ROW]));     // user: re-fetch after insert

    vi.mocked(db.insert).mockReturnValue(makeInsertStub());
    vi.mocked(db.$count).mockResolvedValue(1); // not first user → caregiver

    const result = await requireHousehold();

    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(result.user.id).toBe(USER_ID);
  });

  // ── Regression: concurrent requests must not blow up on unique-constraint ──

  it('handles race: household insert conflicts, re-fetch succeeds', async () => {
    // Simulates: two requests race. This request loses the insert race
    // (onConflictDoNothing silently no-ops), re-fetch returns the winner's row.
    vi.mocked(db.select)
      .mockReturnValueOnce(makeSelectStub([]))              // household: not found (pre-insert)
      .mockReturnValueOnce(makeSelectStub([HOUSEHOLD_ROW])) // household: re-fetch finds it
      .mockReturnValueOnce(makeSelectStub([USER_ROW]));     // user: found

    vi.mocked(db.insert).mockReturnValue(makeInsertStub([])); // conflict → nothing returned

    const result = await requireHousehold();

    expect(result.household.id).toBe(HH_ID);
    expect(result.user.id).toBe(USER_ID);
  });

  it('handles race: user insert conflicts, re-fetch succeeds', async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce(makeSelectStub([HOUSEHOLD_ROW])) // household: found
      .mockReturnValueOnce(makeSelectStub([]))              // user: not found (pre-insert)
      .mockReturnValueOnce(makeSelectStub([USER_ROW]));     // user: re-fetch finds it

    vi.mocked(db.insert).mockReturnValue(makeInsertStub([])); // conflict → nothing returned
    vi.mocked(db.$count).mockResolvedValue(1);

    const result = await requireHousehold();

    expect(result.user.id).toBe(USER_ID);
  });
});
