import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// Audit item 10 regression: lib/notify.ts `send()` previously did
// `await fetch(...)` and never inspected `response.ok`. Resend errors were
// silently swallowed — caregivers could miss email pings indefinitely with
// no log line to investigate.
//
// We verify the source-level invariant: `send()` reads `res.ok` and logs a
// "[notify:email] resend failed: status N body M" line on non-2xx.

const APP_ROOT = join(__dirname, '..');
const NOTIFY = join(APP_ROOT, 'lib', 'notify.ts');

describe('lib/notify.ts send() resend error logging (audit item 10)', () => {
  const src = readFileSync(NOTIFY, 'utf8');

  it('inspects response.ok after the resend fetch', () => {
    // Match `if (!res.ok)` (or `if(!res.ok)`) on the response of the resend call.
    const okCheck = /if\s*\(\s*!\s*res\.ok\s*\)/;
    expect(
      okCheck.test(src),
      'lib/notify.ts send() must check `if (!res.ok)` on the resend response so ' +
      'email failures are logged, not silently swallowed.'
    ).toBe(true);
  });

  it('logs a structured "resend failed" line with status and body', () => {
    const logLine = /\[notify:email\]\s+resend\s+failed:\s+status/;
    expect(
      logLine.test(src),
      'Expected a "[notify:email] resend failed: status …" log line so failures ' +
      'are searchable in Vercel runtime logs.'
    ).toBe(true);
  });

  it('reads response.text() for the body when logging non-2xx', () => {
    // The body in the log line is sourced from `await res.text()`. Make sure
    // that call is actually present so the log is informative, not just
    // "status 500 body undefined".
    const bodyRead = /res\.text\(\)/;
    expect(
      bodyRead.test(src),
      'send() should read `await res.text()` to include the resend error body in the log.'
    ).toBe(true);
  });
});
