import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('@/lib/notify', () => ({
  notifyLanternEscalated: vi.fn().mockResolvedValue(undefined),
}));

import { db } from '@/lib/db';
import { escalateLantern } from '@/lib/lantern-escalation';

type Row = Record<string, unknown>;

function makeSelectChain(rows: Row[]) {
  const chain: Record<string, unknown> = {};
  const t = () => chain;
  chain['from'] = t;
  chain['where'] = t;
  chain['limit'] = t;
  chain['then'] = (resolve: (v: unknown) => void) => { resolve(rows); return chain; };
  chain['catch'] = () => chain;
  chain['finally'] = () => chain;
  return chain;
}

function makeUpdateChain(rows: Row[] = []) {
  const chain: Record<string, unknown> = {};
  const t = () => chain;
  chain['set'] = t;
  chain['where'] = t;
  chain['returning'] = t;
  chain['then'] = (resolve: (v: unknown) => void) => { resolve(rows); return chain; };
  chain['catch'] = () => chain;
  chain['finally'] = () => chain;
  return chain;
}

describe('T-A — lantern_escalated structured log on successful escalation', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('successful escalation emits lantern_escalated log', async () => {
    vi.mocked(db.select).mockReturnValue(
      makeSelectChain([{ escalatedAt: null }]) as unknown as ReturnType<typeof db.select>,
    );
    vi.mocked(db.update).mockReturnValue(
      makeUpdateChain([{ id: 'lantern-1' }]) as unknown as ReturnType<typeof db.update>,
    );

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await escalateLantern('lantern-1');

    const calls = logSpy.mock.calls.map(c => c[0] as string);
    const escalatedLog = calls.find(c => {
      try { return JSON.parse(c).event === 'lantern_escalated'; } catch { return false; }
    });
    expect(escalatedLog).toBeDefined();
    const parsed = JSON.parse(escalatedLog!);
    expect(parsed.lanternId).toBe('lantern-1');
    expect(parsed.at).toBeDefined();

    logSpy.mockRestore();
  });

  it('race-lost escalation (UPDATE returns 0 rows) emits no lantern_escalated log', async () => {
    vi.mocked(db.select).mockReturnValue(
      makeSelectChain([{ escalatedAt: null }]) as unknown as ReturnType<typeof db.select>,
    );
    vi.mocked(db.update).mockReturnValue(
      makeUpdateChain([]) as unknown as ReturnType<typeof db.update>,
    );

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await escalateLantern('lantern-1');

    const calls = logSpy.mock.calls.map(c => c[0] as string);
    const escalatedLog = calls.find(c => {
      try { return JSON.parse(c).event === 'lantern_escalated'; } catch { return false; }
    });
    expect(escalatedLog).toBeUndefined();

    logSpy.mockRestore();
  });

  it('already-escalated lantern (escalatedAt not null) emits no log', async () => {
    vi.mocked(db.select).mockReturnValue(
      makeSelectChain([{ escalatedAt: new Date() }]) as unknown as ReturnType<typeof db.select>,
    );

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await escalateLantern('lantern-1');

    const calls = logSpy.mock.calls.map(c => c[0] as string);
    const escalatedLog = calls.find(c => {
      try { return JSON.parse(c).event === 'lantern_escalated'; } catch { return false; }
    });
    expect(escalatedLog).toBeUndefined();

    logSpy.mockRestore();
  });
});
