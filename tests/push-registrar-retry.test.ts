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

const FAKE_SUB = { toJSON: () => ({ endpoint: 'https://fcm.test/1', keys: { p256dh: 'p', auth: 'a' } }) };

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
});
