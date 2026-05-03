import { describe, it, expect, vi, beforeEach } from 'vitest';

// L17 regression: classifyWebPushError must map 403/413 to prune (staleIds) and
// 429/5xx to retry (failed). Pre-B6, all non-404/410 codes collapsed into
// result.failed without pruning the row. Reverting the 403 branch in
// classifyWebPushError must turn test 3 red.

// vi.hoisted allows mock factories to reference shared mocks without hoisting issues.
const { mockSendNotification, mockDelete, mockSelect } = vi.hoisted(() => {
  const mockSendNotification = vi.fn();
  const mockDelete = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
  const mockSelect = vi.fn();
  return { mockSendNotification, mockDelete, mockSelect };
});

vi.mock('web-push', () => {
  class WebPushError extends Error {
    statusCode: number;
    body: string;
    constructor(code: number, msg = '') {
      super(msg || `HTTP ${code}`);
      this.statusCode = code;
      this.body = msg;
    }
  }
  return {
    default: {
      setVapidDetails: vi.fn(),
      sendNotification: mockSendNotification,
    },
    WebPushError,
  };
});

vi.mock('@/lib/db', () => ({
  db: {
    delete: mockDelete,
    select: mockSelect,
  },
}));

vi.stubEnv('VAPID_SUBJECT', 'mailto:test@test.com');
vi.stubEnv('VAPID_PUBLIC_KEY', 'test-public-key');
vi.stubEnv('VAPID_PRIVATE_KEY', 'test-private-key');

import { pushToUser } from '@/lib/push';

const SUB = { id: 'sub-id-1', endpoint: 'https://fcm.example.com/push/1', p256dh: 'key', auth: 'auth' };
const PAYLOAD = { title: 'Test', body: 'Test body' };

function makeWpe(code: number, body = '') {
  const e = new Error(`HTTP ${code}`) as Error & { statusCode: number; body: string };
  e.statusCode = code;
  e.body = body;
  return e;
}

const mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});

function lastPushBatchLog() {
  const calls = mockConsoleLog.mock.calls;
  for (let i = calls.length - 1; i >= 0; i--) {
    try {
      const parsed = JSON.parse(calls[i][0] as string);
      if (parsed.event === 'push_batch') return parsed;
    } catch { /* not JSON */ }
  }
  return null;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDelete.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
  mockSelect.mockReturnValue({ from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([SUB]) }) });
});

describe('L17 push error classification', () => {
  it('404 → prune: stale++, row queued for delete, error tagged gone_404', async () => {
    mockSendNotification.mockRejectedValueOnce(makeWpe(404));
    const result = await pushToUser('user-1', PAYLOAD);
    expect(result.stale).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.delivered).toBe(0);
    expect(result.errors[0]).toMatch(/gone_404/);
    expect(mockDelete).toHaveBeenCalledTimes(1);
    const log = lastPushBatchLog();
    expect(log?.dispositions.prune).toBe(1);
    expect(log?.dispositions.retry).toBe(0);
  });

  it('410 → prune: stale++, row queued for delete, error tagged gone_410', async () => {
    mockSendNotification.mockRejectedValueOnce(makeWpe(410));
    const result = await pushToUser('user-1', PAYLOAD);
    expect(result.stale).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.errors[0]).toMatch(/gone_410/);
    const log = lastPushBatchLog();
    expect(log?.dispositions.prune).toBe(1);
  });

  it('403 → prune: stale++, row queued for delete, error tagged auth_403 (headline L17 fix)', async () => {
    mockSendNotification.mockRejectedValueOnce(makeWpe(403));
    const result = await pushToUser('user-1', PAYLOAD);
    // Falsifiability gate: revert the 403 branch in classifyWebPushError → this assertion goes red.
    expect(result.stale).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.errors[0]).toMatch(/auth_403/);
    expect(mockDelete).toHaveBeenCalledTimes(1);
    const log = lastPushBatchLog();
    expect(log?.dispositions.prune).toBe(1);
  });

  it('413 → prune: stale++, row queued for delete, error tagged payload_413', async () => {
    mockSendNotification.mockRejectedValueOnce(makeWpe(413));
    const result = await pushToUser('user-1', PAYLOAD);
    expect(result.stale).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.errors[0]).toMatch(/payload_413/);
    const log = lastPushBatchLog();
    expect(log?.dispositions.prune).toBe(1);
  });

  it('429 → retry: failed++, row NOT queued for delete, error tagged ratelimit_429', async () => {
    mockSendNotification.mockRejectedValueOnce(makeWpe(429));
    const result = await pushToUser('user-1', PAYLOAD);
    expect(result.failed).toBe(1);
    expect(result.stale).toBe(0);
    expect(mockDelete).not.toHaveBeenCalled();
    expect(result.errors[0]).toMatch(/ratelimit_429/);
    const log = lastPushBatchLog();
    expect(log?.dispositions.retry).toBe(1);
    expect(log?.dispositions.prune).toBe(0);
  });

  it('500 → retry: failed++, row NOT queued for delete, error tagged server_5xx', async () => {
    mockSendNotification.mockRejectedValueOnce(makeWpe(500));
    const result = await pushToUser('user-1', PAYLOAD);
    expect(result.failed).toBe(1);
    expect(result.stale).toBe(0);
    expect(mockDelete).not.toHaveBeenCalled();
    expect(result.errors[0]).toMatch(/server_5xx/);
    const log = lastPushBatchLog();
    expect(log?.dispositions.retry).toBe(1);
  });

  it.each([502, 503, 504])('%i → retry: server_5xx', async (code) => {
    mockSendNotification.mockRejectedValueOnce(makeWpe(code));
    mockSelect.mockReturnValueOnce({ from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([SUB]) }) });
    const result = await pushToUser('user-1', PAYLOAD);
    expect(result.failed).toBe(1);
    expect(result.stale).toBe(0);
    expect(result.errors[0]).toMatch(/server_5xx/);
  });

  // Apple push returns 403 + {"reason":"BadJwtToken"} when the JWT is signed against
  // a key the subscription wasn't created with — i.e. after a VAPID key rotation.
  // We prune the stale sub; the client (PushRegistrar) auto-resubscribes against the
  // current public key on next PWA open, so a pruned sub is replaced within minutes.
  // Earlier behavior (retry-don't-prune) was correct WHEN the server occasionally sent
  // malformed JWTs, but ensureVapid() now validates keys before signing — every
  // BadJwtToken now means key-mismatch, which is permanent until resubscription.
  it('403 + BadJwtToken body → prune (key rotation orphan)', async () => {
    mockSendNotification.mockRejectedValueOnce(makeWpe(403, '{"reason":"BadJwtToken"}'));
    const result = await pushToUser('user-1', PAYLOAD);
    expect(result.stale).toBe(1);
    expect(result.failed).toBe(0);
    expect(mockDelete).toHaveBeenCalled();
    expect(result.errors[0]).toMatch(/jwt_error/);
    const log = lastPushBatchLog();
    expect(log?.dispositions.prune).toBe(1);
    expect(log?.dispositions.retry).toBe(0);
  });

  it('403 + ExpiredJwtToken body → prune (key rotation orphan)', async () => {
    mockSendNotification.mockRejectedValueOnce(makeWpe(403, '{"reason":"ExpiredJwtToken"}'));
    const result = await pushToUser('user-1', PAYLOAD);
    expect(result.stale).toBe(1);
    expect(result.failed).toBe(0);
    expect(mockDelete).toHaveBeenCalled();
    const log = lastPushBatchLog();
    expect(log?.dispositions.prune).toBe(1);
    expect(log?.dispositions.retry).toBe(0);
  });

  it('418 → unknown: failed++, row NOT pruned, error tagged http_418', async () => {
    mockSendNotification.mockRejectedValueOnce(makeWpe(418));
    const result = await pushToUser('user-1', PAYLOAD);
    expect(result.failed).toBe(1);
    expect(result.stale).toBe(0);
    expect(mockDelete).not.toHaveBeenCalled();
    expect(result.errors[0]).toMatch(/http_418/);
    const log = lastPushBatchLog();
    expect(log?.dispositions.unknown).toBe(1);
    expect(log?.dispositions.prune).toBe(0);
  });

  it('mixed batch [404, 403, 429, 500, 200] → correct disposition breakdown', async () => {
    const subs = [1, 2, 3, 4, 5].map(n => ({
      id: `sub-${n}`, endpoint: `https://fcm.example.com/${n}`, p256dh: 'k', auth: 'a',
    }));
    mockSelect.mockReturnValueOnce({ from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(subs) }) });
    mockSendNotification
      .mockRejectedValueOnce(makeWpe(404))
      .mockRejectedValueOnce(makeWpe(403))
      .mockRejectedValueOnce(makeWpe(429))
      .mockRejectedValueOnce(makeWpe(500))
      .mockResolvedValueOnce(undefined);

    const result = await pushToUser('user-1', PAYLOAD);
    expect(result.delivered).toBe(1);
    expect(result.stale).toBe(2);
    expect(result.failed).toBe(2);

    const log = lastPushBatchLog();
    expect(log?.dispositions).toEqual({ prune: 2, retry: 2, unknown: 0 });
    expect(mockDelete).toHaveBeenCalledTimes(1);
  });
});
