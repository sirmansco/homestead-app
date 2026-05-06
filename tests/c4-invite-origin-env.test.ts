import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// C4 regression: invite routes must derive origin from NEXT_PUBLIC_APP_URL
// env, never from req.headers.get('origin') or new URL(req.url).origin.
// Trusting the request Origin lets a forged invite URL embed the inviter's
// host on a phishing page; req.url ties to whichever vercel preview handled
// the request rather than the canonical app origin.

const root = path.resolve(__dirname, '..');
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf-8');

describe('C4 — invite routes derive origin from env only', () => {
  it('app/api/circle/invite/route.ts uses NEXT_PUBLIC_APP_URL, not req headers', () => {
    const src = read('app/api/circle/invite/route.ts');
    expect(src).toMatch(/NEXT_PUBLIC_APP_URL/);
    // No fallback to request-derived origin.
    expect(src).not.toMatch(/req\.headers\.get\(['"]origin['"]\)/);
    expect(src).not.toMatch(/new URL\(req\.url\)\.origin/);
  });

  it('app/api/circle/invite-family/route.ts uses NEXT_PUBLIC_APP_URL, not req headers', () => {
    const src = read('app/api/circle/invite-family/route.ts');
    expect(src).toMatch(/NEXT_PUBLIC_APP_URL/);
    expect(src).not.toMatch(/req\.headers\.get\(['"]origin['"]\)/);
    expect(src).not.toMatch(/new URL\(req\.url\)\.origin/);
  });
});
