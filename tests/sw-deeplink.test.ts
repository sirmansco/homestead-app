import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// L19 regression: notificationclick must call client.navigate(targetUrl) before
// client.focus() in the matched-client branch. Pre-B6, the handler called only
// client.focus(), dropping the deep-link URL.
//
// Source-grep test per diagnostics-lantern-recipients.test.ts precedent — the
// SW handler is a string of JS served by a Next.js route and is not trivially
// runnable in a test environment. Falsifiability: revert the SW handler to the
// pre-B6 shape (remove the navigate call) → assertions 1 and 2 go red.

const SW_ROUTE = path.resolve(__dirname, '..', 'app', 'api', 'sw-script', 'route.ts');

describe('L19 service worker deep-link fix', () => {
  it('SW handler source contains client.navigate(targetUrl)', () => {
    const src = readFileSync(SW_ROUTE, 'utf-8');
    // Regex covers common formatting variations
    expect(src).toMatch(/client\.navigate\(\s*targetUrl\s*\)/);
  });

  it('client.navigate(targetUrl) appears before client.focus() in the matched-client branch', () => {
    const src = readFileSync(SW_ROUTE, 'utf-8');
    const navigateIdx = src.indexOf('client.navigate(targetUrl)');
    const focusIdx = src.indexOf('return client.focus()');
    expect(navigateIdx).toBeGreaterThan(-1);
    expect(focusIdx).toBeGreaterThan(-1);
    expect(navigateIdx).toBeLessThan(focusIdx);
  });

  it('targetUrl is resolved via new URL(url, self.location.origin)', () => {
    const src = readFileSync(SW_ROUTE, 'utf-8');
    expect(src).toMatch(/new URL\(\s*url\s*,\s*self\.location\.origin\s*\)/);
  });
});
