import { describe, it, expect } from 'vitest';
import type { ErrorEvent } from '@sentry/core';
import { scrubEvent, stripQueryString } from '@/lib/sentry-scrub';
// scrubEvent accepts a Sentry ErrorEvent (the type Sentry's beforeSend hook
// passes for non-transaction events).
type Event = ErrorEvent;

// ── stripQueryString ────────────────────────────────────────────────────────

describe('stripQueryString', () => {
  it('drops everything after the first ?', () => {
    expect(stripQueryString('https://covey.app/api/whistles/ical?token=abc123')).toBe('https://covey.app/api/whistles/ical');
  });
  it('returns input unchanged when no ?', () => {
    expect(stripQueryString('https://covey.app/api/whistles')).toBe('https://covey.app/api/whistles');
  });
  it('handles relative paths', () => {
    expect(stripQueryString('/api/x?y=1')).toBe('/api/x');
  });
  it('returns input unchanged when empty', () => {
    expect(stripQueryString('')).toBe('');
  });
});

// ── scrubEvent ──────────────────────────────────────────────────────────────

describe('scrubEvent — request.url query strings', () => {
  it('strips ?token= from a calendar feed URL', () => {
    const event: Event = { type: undefined,
      request: { url: 'https://covey.app/api/whistles/ical?token=abc123secret', headers: {} },
    };
    const out = scrubEvent(event)!;
    expect(out.request!.url).toBe('https://covey.app/api/whistles/ical');
    expect(JSON.stringify(out)).not.toContain('abc123secret');
  });

  it('clears query_string field even if Sentry collected it separately', () => {
    const event: Event = { type: undefined,
      request: {
        url: 'https://covey.app/api/x',
        query_string: 'token=abc123',
        headers: {},
      },
    };
    const out = scrubEvent(event)!;
    expect(out.request!.query_string).toBeUndefined();
  });
});

describe('scrubEvent — authorization-style headers', () => {
  it('redacts authorization, cookie, and clerk session headers', () => {
    const event: Event = { type: undefined,
      request: {
        url: 'https://covey.app/api/x',
        headers: {
          authorization: 'Bearer ey.xxx.yyy',
          cookie: '__session=zzz',
          'x-clerk-auth-status': 'signed-in',
          'content-type': 'application/json',
        },
      },
    };
    const out = scrubEvent(event)!;
    const headers = out.request!.headers!;
    expect(headers.authorization).toBe('[redacted]');
    expect(headers.cookie).toBe('[redacted]');
    expect(headers['x-clerk-auth-status']).toBe('[redacted]');
    expect(headers['content-type']).toBe('application/json'); // benign passes through
    expect(JSON.stringify(out)).not.toContain('ey.xxx.yyy');
    expect(JSON.stringify(out)).not.toContain('__session=zzz');
  });

  it('redacts arbitrary token-bearing headers via substring match', () => {
    const event: Event = { type: undefined,
      request: {
        url: '/x',
        headers: {
          'x-api-token': 'sk_live_xxx',
          'x-some-secret-key': 'shhh',
          'x-totally-fine': 'visible',
        },
      },
    };
    const out = scrubEvent(event)!;
    expect(out.request!.headers!['x-api-token']).toBe('[redacted]');
    expect(out.request!.headers!['x-some-secret-key']).toBe('[redacted]');
    expect(out.request!.headers!['x-totally-fine']).toBe('visible');
  });

  it('clears request.cookies object entirely', () => {
    const event: Event = { type: undefined,
      request: {
        url: '/x',
        cookies: { __session: 'xxx', other: 'yyy' },
        headers: {},
      },
    };
    const out = scrubEvent(event)!;
    expect(out.request!.cookies).toEqual({});
  });
});

describe('scrubEvent — event.extra PII keys', () => {
  it('redacts kid + parent + email name fields', () => {
    const event: Event = { type: undefined,
      extra: {
        chickName: 'Lila',
        parentName: 'Matthew',
        firstName: 'Meredith',
        last_name: 'Sirmans',
        email: 'mjsirmans@example.com',
        forWhom: 'Lila',
        unrelated_debug_id: 'abc-123',
      },
    };
    const out = scrubEvent(event)!;
    expect(out.extra!.chickName).toBe('[redacted]');
    expect(out.extra!.parentName).toBe('[redacted]');
    expect(out.extra!.firstName).toBe('[redacted]');
    expect(out.extra!.last_name).toBe('[redacted]');
    expect(out.extra!.email).toBe('[redacted]');
    expect(out.extra!.forWhom).toBe('[redacted]');
    expect(out.extra!.unrelated_debug_id).toBe('abc-123');
  });

  it('does not modify unrelated extras', () => {
    const event: Event = { type: undefined, extra: { stack_phase: 'init', count: 5 } };
    const out = scrubEvent(event)!;
    expect(out.extra).toEqual({ stack_phase: 'init', count: 5 });
  });
});

describe('scrubEvent — non-mutation guarantee', () => {
  it('does not mutate the input event object', () => {
    const event: Event = { type: undefined,
      request: {
        url: 'https://x?token=abc',
        headers: { authorization: 'Bearer xxx' },
      },
      extra: { firstName: 'Alice' },
    };
    const before = JSON.parse(JSON.stringify(event));
    scrubEvent(event);
    expect(event).toEqual(before);
  });
});

describe('scrubEvent — falsifiability invariant', () => {
  // This test ensures that the scrubbed serialized event NEVER contains any
  // of the well-known PII strings we deliberately fed it. If a future refactor
  // accidentally drops one of the scrubbing branches, this catches it.
  it('serialized output contains zero PII strings from a hostile event', () => {
    const event: Event = { type: undefined,
      request: {
        url: 'https://covey.app/api/whistles/ical?token=secret_token_xyz',
        query_string: 'token=secret_token_xyz',
        cookies: { __session: 'session_cookie_abc' },
        headers: {
          authorization: 'Bearer leaked_jwt_def',
          cookie: '__session=session_cookie_abc',
        },
      },
      extra: {
        chickName: 'Lila',
        email: 'mjsirmans@example.com',
      },
    };
    const out = scrubEvent(event)!;
    const serialized = JSON.stringify(out);
    for (const needle of [
      'secret_token_xyz',
      'session_cookie_abc',
      'leaked_jwt_def',
      'Lila',
      'mjsirmans@example.com',
    ]) {
      expect(serialized).not.toContain(needle);
    }
  });
});
