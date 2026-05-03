import { describe, it, expect, vi, beforeEach } from 'vitest';

// BUG-D regression: subscribeWithRetry must retry pushManager.subscribe() up to
// 3 times with delays when it throws — iOS PWA timing race causes subscribe() to
// fail immediately after serviceWorker.ready on first install.
// Reverting to a single subscribe() call (no retry) must turn the
// "called subscribe N times before succeeding" assertions red.

const { mockGetSubscription, mockSubscribe, mockFetch, mockRequestPermission } = vi.hoisted(() => {
  const mockGetSubscription = vi.fn();
  const mockSubscribe = vi.fn();
  const mockFetch = vi.fn().mockResolvedValue({ ok: true });
  const mockRequestPermission = vi.fn().mockResolvedValue('granted');
  return { mockGetSubscription, mockSubscribe, mockFetch, mockRequestPermission };
});

// Inject VAPID key before module evaluation
vi.mock('@/app/components/PushRegistrar', async (importOriginal) => {
  // Patch process.env before the real module code runs
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'dGVzdC12YXBpZC1rZXk';
  const mod = await importOriginal<typeof import('@/app/components/PushRegistrar')>();
  return mod;
});

vi.stubGlobal('fetch', mockFetch);
vi.stubGlobal('window', { PushManager: class {} });
vi.stubGlobal('Notification', {
  requestPermission: mockRequestPermission,
  permission: 'granted',
});
vi.stubGlobal('navigator', {
  serviceWorker: {
    get ready() {
      return Promise.resolve({
        pushManager: {
          getSubscription: mockGetSubscription,
          subscribe: mockSubscribe,
        },
      });
    },
  },
});

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch.mockResolvedValue({ ok: true });
  mockGetSubscription.mockResolvedValue(null);
  mockRequestPermission.mockResolvedValue('granted');
  vi.useFakeTimers();
});

import { requestPushPermission } from '@/app/components/PushRegistrar';

// Build a Uint8Array buffer matching the test VAPID key so existing subs
// pass the post-rotation key-mismatch check in subscribeWithRetry.
function vapidKeyBuffer(b64: string): ArrayBuffer {
  const padding = '='.repeat((4 - (b64.length % 4)) % 4);
  const std = (b64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(std);
  const arr = Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
  return arr.buffer;
}
const TEST_VAPID_BYTES = vapidKeyBuffer('dGVzdC12YXBpZC1rZXk');

const FAKE_SUB = {
  toJSON: () => ({ endpoint: 'https://fcm.test/1', keys: { p256dh: 'p', auth: 'a' } }),
  options: { applicationServerKey: TEST_VAPID_BYTES },
};

describe('PushRegistrar — subscribeWithRetry (BUG-D)', () => {
  it('succeeds on first attempt when subscribe resolves immediately', async () => {
    mockSubscribe.mockResolvedValueOnce(FAKE_SUB);

    const promise = requestPushPermission();
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.ok).toBe(true);
    expect(mockSubscribe).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith('/api/push/subscribe', expect.any(Object));
  });

  it('retries and succeeds on second attempt after first throws', async () => {
    mockSubscribe
      .mockRejectedValueOnce(new Error('SW not ready'))
      .mockResolvedValueOnce(FAKE_SUB);

    const promise = requestPushPermission();
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.ok).toBe(true);
    expect(mockSubscribe).toHaveBeenCalledTimes(2);
  });

  it('retries and succeeds on third attempt after two failures', async () => {
    mockSubscribe
      .mockRejectedValueOnce(new Error('SW not ready'))
      .mockRejectedValueOnce(new Error('SW not ready'))
      .mockResolvedValueOnce(FAKE_SUB);

    const promise = requestPushPermission();
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.ok).toBe(true);
    expect(mockSubscribe).toHaveBeenCalledTimes(3);
  });

  it('returns error after all retries exhausted', async () => {
    mockSubscribe.mockRejectedValue(new Error('SW never ready'));

    const promise = requestPushPermission();
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.ok).toBe(false);
    // 1 initial + 3 retries = 4 total
    expect(mockSubscribe).toHaveBeenCalledTimes(4);
  });

  it('uses existing subscription without calling subscribe', async () => {
    mockGetSubscription.mockResolvedValueOnce(FAKE_SUB);

    const promise = requestPushPermission();
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.ok).toBe(true);
    expect(mockSubscribe).not.toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalledWith('/api/push/subscribe', expect.any(Object));
  });

  // iOS stale-subscription regression: getSubscription() returns a sub with
  // null keys (known WebKit bug). Must unsubscribe + subscribe fresh instead
  // of forwarding null keys to the API (which returns 400).
  it('unsubscribes and resubscribes when existing subscription has null keys', async () => {
    const mockUnsubscribe = vi.fn().mockResolvedValue(true);
    const staleSubNullKeys = {
      toJSON: () => ({ endpoint: 'https://fcm.test/stale', keys: { p256dh: null, auth: null } }),
      options: { applicationServerKey: TEST_VAPID_BYTES },
      unsubscribe: mockUnsubscribe,
    };
    mockGetSubscription.mockResolvedValueOnce(staleSubNullKeys);
    mockSubscribe.mockResolvedValueOnce(FAKE_SUB);

    const promise = requestPushPermission();
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.ok).toBe(true);
    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
    expect(mockSubscribe).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith('/api/push/subscribe', expect.any(Object));
    // Verify the body sent to the API has valid keys (not the null ones)
    const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body.keys?.p256dh).toBeTruthy();
    expect(body.keys?.auth).toBeTruthy();
  });

  // VAPID key rotation regression: getSubscription() returns a sub with valid
  // keys but bound to a PREVIOUS applicationServerKey. After a rotation the
  // server signs JWTs with the new private key; pushes to that sub fail with
  // BadJwtToken forever. PushRegistrar must detect the byte-mismatch, drop
  // the orphan sub, and resubscribe against the current public key — that's
  // the auto-heal property that lets a key rotation be seamless for users.
  it('drops and resubscribes when existing subscription was bound to a different VAPID key', async () => {
    const mockUnsubscribe = vi.fn().mockResolvedValue(true);
    // Build an applicationServerKey that does NOT match the test VAPID bytes.
    const orphanedKey = vapidKeyBuffer('YS1kaWZmZXJlbnQta2V5');
    const orphanSub = {
      toJSON: () => ({ endpoint: 'https://web.push.apple.com/orphan', keys: { p256dh: 'p', auth: 'a' } }),
      options: { applicationServerKey: orphanedKey },
      unsubscribe: mockUnsubscribe,
    };
    mockGetSubscription.mockResolvedValueOnce(orphanSub);
    mockSubscribe.mockResolvedValueOnce(FAKE_SUB);

    const promise = requestPushPermission();
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.ok).toBe(true);
    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
    expect(mockSubscribe).toHaveBeenCalledTimes(1);
    // Confirm the new sub registered with the API uses the FRESH endpoint, not the orphan's.
    const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body.endpoint).toBe('https://fcm.test/1');
  });
});
