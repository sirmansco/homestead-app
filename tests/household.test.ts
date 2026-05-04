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
    transaction: vi.fn(),
    execute: vi.fn(),
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

// Drives db.transaction(callback) by invoking the callback with a tx object
// that proxies to the same select/insert/$count mocks the outer test sets up.
// The callback's return value resolves out of the transaction call.
function installTransactionPassthrough() {
  vi.mocked(db.transaction).mockImplementation(async (cb: (tx: unknown) => unknown) => {
    const tx = {
      select: db.select,
      insert: db.insert,
      update: db.update,
      $count: db.$count,
      execute: vi.fn().mockResolvedValue(undefined), // pg_advisory_xact_lock no-op in tests
    };
    return await cb(tx);
  });
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
    installTransactionPassthrough();
    vi.mocked(db.select)
      .mockReturnValueOnce(makeSelectStub([HOUSEHOLD_ROW])) // household: found
      .mockReturnValueOnce(makeSelectStub([]))              // outer user lookup: not found
      .mockReturnValueOnce(makeSelectStub([]))              // inside tx: existing-user check, none
      .mockReturnValueOnce(makeSelectStub([USER_ROW]));     // inside tx: re-fetch after insert

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
      .mockReturnValueOnce(makeSelectStub([USER_ROW]));     // user: found (no tx path)

    vi.mocked(db.insert).mockReturnValue(makeInsertStub([])); // conflict → nothing returned

    const result = await requireHousehold();

    expect(result.household.id).toBe(HH_ID);
    expect(result.user.id).toBe(USER_ID);
  });

  it('handles race: user insert conflicts inside transaction, re-fetch succeeds', async () => {
    installTransactionPassthrough();
    vi.mocked(db.select)
      .mockReturnValueOnce(makeSelectStub([HOUSEHOLD_ROW])) // household: found
      .mockReturnValueOnce(makeSelectStub([]))              // outer user lookup: not found
      .mockReturnValueOnce(makeSelectStub([]))              // inside tx: existing-user check, none
      .mockReturnValueOnce(makeSelectStub([USER_ROW]));     // inside tx: re-fetch finds the winner's row

    vi.mocked(db.insert).mockReturnValue(makeInsertStub([])); // conflict → nothing returned
    vi.mocked(db.$count).mockResolvedValue(1);

    const result = await requireHousehold();

    expect(result.user.id).toBe(USER_ID);
  });

  // ── B2: first-user race (Session 5 deferred from Session 4) ─────────────────
  //
  // Two concurrent requireHousehold() calls for different clerkUserIds in the
  // same empty household. Without the advisory lock + transactional re-count,
  // both observed memberCount === 0 and both inserted with isAdmin=true. The
  // fix serializes the count+insert inside a transaction held by
  // pg_advisory_xact_lock(hashtext('covey:first-user:' + household.id)) — only
  // one transaction at a time can run that block per household.
  //
  // We can't simulate real Postgres locking in vitest, but we CAN prove:
  //   (1) the advisory lock is acquired inside the transaction before any
  //       count/insert, AND
  //   (2) when memberCount > 0 (i.e. the other tx has already committed by the
  //       time we re-count inside our tx), isFirstUser is false and the row
  //       inserts with isAdmin=false.

  it('B2 race: second user observes count > 0 inside tx and inserts with isAdmin=false', async () => {
    // Capture what the insert is called with so we can assert on isAdmin.
    const insertedValues: unknown[] = [];
    const captureInsertStub = () => {
      const chain: Record<string, unknown> = {};
      chain['values'] = (vals: unknown) => { insertedValues.push(vals); return chain; };
      chain['onConflictDoNothing'] = () => chain;
      chain['returning'] = () => chain;
      chain['then'] = (resolve: (v: unknown) => void) => { resolve([]); return chain; };
      chain['catch'] = () => chain;
      chain['finally'] = () => chain;
      return chain;
    };

    installTransactionPassthrough();
    vi.mocked(db.select)
      .mockReturnValueOnce(makeSelectStub([HOUSEHOLD_ROW])) // household: found
      .mockReturnValueOnce(makeSelectStub([]))              // outer user lookup: not found
      .mockReturnValueOnce(makeSelectStub([]))              // inside tx: existing-user check, none
      .mockReturnValueOnce(makeSelectStub([{ ...USER_ROW, role: 'watcher', isAdmin: false }]));

    vi.mocked(db.insert).mockReturnValue(captureInsertStub() as ReturnType<typeof db.insert>);
    // Other transaction has committed first-user; our tx now sees count = 1.
    vi.mocked(db.$count).mockResolvedValue(1);

    const result = await requireHousehold();

    expect(insertedValues).toHaveLength(1);
    expect((insertedValues[0] as { isAdmin?: boolean }).isAdmin).toBe(false);
    expect((insertedValues[0] as { role?: string }).role).toBe('watcher');
    expect(result.user).toBeTruthy();
  });

  it('B2 race: first user observes count === 0 inside tx and inserts with isAdmin=true', async () => {
    const insertedValues: unknown[] = [];
    const captureInsertStub = () => {
      const chain: Record<string, unknown> = {};
      chain['values'] = (vals: unknown) => { insertedValues.push(vals); return chain; };
      chain['onConflictDoNothing'] = () => chain;
      chain['returning'] = () => chain;
      chain['then'] = (resolve: (v: unknown) => void) => { resolve([]); return chain; };
      chain['catch'] = () => chain;
      chain['finally'] = () => chain;
      return chain;
    };

    installTransactionPassthrough();
    vi.mocked(db.select)
      .mockReturnValueOnce(makeSelectStub([HOUSEHOLD_ROW]))
      .mockReturnValueOnce(makeSelectStub([]))
      .mockReturnValueOnce(makeSelectStub([]))
      .mockReturnValueOnce(makeSelectStub([USER_ROW]));

    vi.mocked(db.insert).mockReturnValue(captureInsertStub() as ReturnType<typeof db.insert>);
    vi.mocked(db.$count).mockResolvedValue(0);

    await requireHousehold();

    expect(insertedValues).toHaveLength(1);
    expect((insertedValues[0] as { isAdmin?: boolean }).isAdmin).toBe(true);
    expect((insertedValues[0] as { role?: string }).role).toBe('keeper');
  });

  it('B2: advisory lock is acquired before count/insert inside transaction', async () => {
    const callOrder: string[] = [];
    const lockExecute = vi.fn().mockImplementation((q: unknown) => {
      // Drizzle sql tag produces an object with a `queryChunks`-ish shape; we
      // just need to confirm the query mentions pg_advisory_xact_lock.
      const serialized = JSON.stringify(q);
      if (serialized.includes('pg_advisory_xact_lock')) callOrder.push('lock');
      return Promise.resolve(undefined);
    });

    vi.mocked(db.transaction).mockImplementation(async (cb: (tx: unknown) => unknown) => {
      const tx = {
        select: vi.fn().mockImplementation((...args: unknown[]) => {
          callOrder.push('select');
          return (db.select as unknown as (...a: unknown[]) => unknown)(...args);
        }),
        insert: vi.fn().mockImplementation((...args: unknown[]) => {
          callOrder.push('insert');
          return (db.insert as unknown as (...a: unknown[]) => unknown)(...args);
        }),
        update: db.update,
        $count: vi.fn().mockImplementation(async (...args: unknown[]) => {
          callOrder.push('count');
          return (db.$count as unknown as (...a: unknown[]) => unknown)(...args);
        }),
        execute: lockExecute,
      };
      return await cb(tx);
    });

    vi.mocked(db.select)
      .mockReturnValueOnce(makeSelectStub([HOUSEHOLD_ROW]))
      .mockReturnValueOnce(makeSelectStub([]))
      .mockReturnValueOnce(makeSelectStub([]))
      .mockReturnValueOnce(makeSelectStub([USER_ROW]));
    vi.mocked(db.insert).mockReturnValue(makeInsertStub());
    vi.mocked(db.$count).mockResolvedValue(0);

    await requireHousehold();

    // Lock must come before any tx select/count/insert. The first 'select'
    // call inside callOrder is the inside-tx existing-user check.
    expect(callOrder[0]).toBe('lock');
    expect(callOrder).toContain('count');
    expect(callOrder).toContain('insert');
    expect(callOrder.indexOf('lock')).toBeLessThan(callOrder.indexOf('count'));
    expect(callOrder.indexOf('lock')).toBeLessThan(callOrder.indexOf('insert'));
  });
});
