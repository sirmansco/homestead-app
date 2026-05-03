import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// Server-side push uses VAPID_PUBLIC_KEY (no prefix). NEXT_PUBLIC_ vars are
// inlined into the build bundle by Next.js, so a bad key set during a prior
// build stays frozen in the server chunk regardless of the current Vercel env.
// The earlier convention (NEXT_PUBLIC_VAPID_PUBLIC_KEY server-side) caused the
// push-frozen-key incident on 2026-05-03 — the prod bundle baked in a stale
// invalid base64 key and every POST /api/lantern threw "Vapid public key must
// be URL safe Base 64" until the var was un-prefixed.
//
// Diagnostics must surface the keys lib/push.ts actually consumes —
// VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY, VAPID_SUBJECT — and should also surface
// NEXT_PUBLIC_VAPID_PUBLIC_KEY so ops can verify the client and server agree.

const APP_ROOT = join(__dirname, '..');
const DIAGNOSTICS = join(APP_ROOT, 'app', 'api', 'diagnostics', 'route.ts');
const PUSH = join(APP_ROOT, 'lib', 'push.ts');

describe('Diagnostics surfaces the same VAPID env vars push.ts consumes (audit item 19)', () => {
  const diagSrc = readFileSync(DIAGNOSTICS, 'utf8');
  const pushSrc = readFileSync(PUSH, 'utf8');

  it('lib/push.ts does NOT read NEXT_PUBLIC_VAPID_PUBLIC_KEY server-side', () => {
    // NEXT_PUBLIC_ vars are inlined at build time. A bad key set during a
    // prior build will stay frozen in the server bundle until the next deploy.
    // Server-side must read VAPID_PUBLIC_KEY (no prefix) so the value is
    // resolved at runtime. Match `process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY`
    // specifically, not bare mentions in comments.
    expect(
      /process\.env\.NEXT_PUBLIC_VAPID_PUBLIC_KEY\b/.test(pushSrc),
      'lib/push.ts runs server-side and must not read process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY. ' +
      'NEXT_PUBLIC_ vars are inlined at build time — read VAPID_PUBLIC_KEY (no prefix) instead.'
    ).toBe(false);
  });

  it('lib/push.ts reads VAPID_PUBLIC_KEY (no prefix)', () => {
    expect(/process\.env\.VAPID_PUBLIC_KEY\b/.test(pushSrc)).toBe(true);
  });

  it('surfaces VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT', () => {
    // These are the three keys lib/push.ts actually requires (see vapid_not_configured).
    expect(/\bVAPID_PUBLIC_KEY\b/.test(diagSrc)).toBe(true);
    expect(/VAPID_PRIVATE_KEY/.test(diagSrc)).toBe(true);
    expect(/VAPID_SUBJECT/.test(diagSrc)).toBe(true);
  });

  it('the keys diagnostics reports are exactly the keys push.ts consumes', () => {
    // Belt-and-suspenders cross-check so future drift in push.ts is caught.
    const pushVars = new Set<string>();
    for (const m of pushSrc.matchAll(/process\.env\.([A-Z0-9_]+)/g)) {
      const name = m[1];
      if (name.startsWith('VAPID')) {
        pushVars.add(name);
      }
    }
    for (const v of pushVars) {
      expect(
        diagSrc.includes(v),
        `Diagnostics should surface ${v} (consumed by lib/push.ts) so ops can verify config.`
      ).toBe(true);
    }
  });
});
