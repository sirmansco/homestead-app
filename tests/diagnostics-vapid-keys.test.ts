import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// Audit item 19 regression: app/api/diagnostics/route.ts previously checked
// `VAPID_PUBLIC_KEY` (no prefix), but lib/push.ts reads
// `NEXT_PUBLIC_VAPID_PUBLIC_KEY`. The diagnostics page reported "configured"
// while push was silently no-oping with `vapid_not_configured`.
//
// The keys exposed by /api/diagnostics must match the keys lib/push.ts
// actually consumes: VAPID_PRIVATE_KEY, NEXT_PUBLIC_VAPID_PUBLIC_KEY,
// VAPID_SUBJECT.

const APP_ROOT = join(__dirname, '..');
const DIAGNOSTICS = join(APP_ROOT, 'app', 'api', 'diagnostics', 'route.ts');
const PUSH = join(APP_ROOT, 'lib', 'push.ts');

describe('Diagnostics surfaces the same VAPID env vars push.ts consumes (audit item 19)', () => {
  const diagSrc = readFileSync(DIAGNOSTICS, 'utf8');
  const pushSrc = readFileSync(PUSH, 'utf8');

  it('does not surface the legacy VAPID_PUBLIC_KEY (no prefix)', () => {
    // The legacy var is unused — surfacing it in diagnostics caused a
    // false-positive "push is configured" reading. Make sure it's gone.
    const legacy = /process\.env\.VAPID_PUBLIC_KEY\b/;
    expect(
      legacy.test(diagSrc),
      'app/api/diagnostics/route.ts must not surface the legacy VAPID_PUBLIC_KEY ' +
      '(no NEXT_PUBLIC_ prefix). lib/push.ts uses NEXT_PUBLIC_VAPID_PUBLIC_KEY.'
    ).toBe(false);
  });

  it('surfaces NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT', () => {
    // These are the three keys lib/push.ts actually requires (see vapid_not_configured).
    expect(/NEXT_PUBLIC_VAPID_PUBLIC_KEY/.test(diagSrc)).toBe(true);
    expect(/VAPID_PRIVATE_KEY/.test(diagSrc)).toBe(true);
    expect(/VAPID_SUBJECT/.test(diagSrc)).toBe(true);
  });

  it('the keys diagnostics reports are exactly the keys push.ts consumes', () => {
    // Belt-and-suspenders cross-check so future drift in push.ts is caught.
    const pushVars = new Set<string>();
    for (const m of pushSrc.matchAll(/process\.env\.([A-Z0-9_]+)/g)) {
      const name = m[1];
      if (name.startsWith('VAPID') || name === 'NEXT_PUBLIC_VAPID_PUBLIC_KEY') {
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
