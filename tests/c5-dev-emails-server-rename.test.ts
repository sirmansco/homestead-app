import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// C5 regression: the SERVER-side dev-emails gate (in app/api/diagnostics)
// must prefer the non-public DEV_EMAILS env var so the gating allowlist
// stops being baked into the client bundle. NEXT_PUBLIC_DEV_EMAILS is
// allowed as a fallback for the half-migrated case but DEV_EMAILS must
// be the primary source.
//
// The CLIENT-side role switcher in CoveyApp.tsx is intentionally still
// reading NEXT_PUBLIC_DEV_EMAILS (UI gate, not a security gate), so this
// test only asserts on the server route.

const root = path.resolve(__dirname, '..');
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf-8');

describe('C5 — server-side DEV_EMAILS not gated by NEXT_PUBLIC only', () => {
  it('app/api/diagnostics/route.ts reads process.env.DEV_EMAILS as primary source', () => {
    const src = read('app/api/diagnostics/route.ts');
    expect(src).toMatch(/process\.env\.DEV_EMAILS/);
    // The order matters — DEV_EMAILS must come BEFORE NEXT_PUBLIC_DEV_EMAILS
    // in the ?? chain so prod can stop setting the public one.
    const devEmailsIdx = src.indexOf('process.env.DEV_EMAILS');
    const publicIdx = src.indexOf('process.env.NEXT_PUBLIC_DEV_EMAILS');
    expect(devEmailsIdx).toBeGreaterThan(0);
    if (publicIdx !== -1) {
      expect(devEmailsIdx, 'DEV_EMAILS must come before NEXT_PUBLIC_DEV_EMAILS in fallback chain').toBeLessThan(publicIdx);
    }
  });

  it('CoveyApp.tsx still reads NEXT_PUBLIC_DEV_EMAILS for the client-side UI gate', () => {
    // Confirms we did NOT accidentally also rename the client-side reference
    // (which would brick the role switcher because client bundles can't
    // read non-public env vars).
    const src = read('app/components/CoveyApp.tsx');
    expect(src).toMatch(/process\.env\.NEXT_PUBLIC_DEV_EMAILS/);
  });
});
