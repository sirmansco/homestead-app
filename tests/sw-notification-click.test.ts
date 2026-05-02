/**
 * Regression test for L19 — SW notificationclick deep-link navigation.
 *
 * Root cause (synthesis L19): the old handler called client.focus() without
 * client.navigate(url) for matched same-origin clients. Deep links carried
 * in payload.url (e.g., /?tab=bell) were ignored on focus.
 *
 * Fix: for matched same-origin clients, call client.navigate(targetUrl) then
 * client.focus(). For no-client path, call clients.openWindow(targetUrl).
 *
 * Falsifiable: remove the client.navigate() call from sw-script/route.ts →
 * the "calls client.navigate before client.focus" assertion goes red.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const swSource = readFileSync(
  path.resolve(__dirname, '../app/api/sw-script/route.ts'),
  'utf-8',
);

// Extract the notificationclick handler from the source
const clickHandlerStart = swSource.indexOf("'notificationclick'");
const clickHandlerEnd = swSource.indexOf("});", clickHandlerStart) + 3;
const clickHandlerSrc = swSource.slice(clickHandlerStart, clickHandlerEnd);

describe('SW notificationclick handler — L19 deep-link navigation', () => {
  it('resolves target URL against self.location.origin', () => {
    expect(clickHandlerSrc).toContain('new URL(url, self.location.origin)');
  });

  it('calls client.navigate(targetUrl) for matched same-origin clients', () => {
    // Falsifiability gate: remove navigate() call → this assertion goes red.
    expect(clickHandlerSrc).toContain('client.navigate(targetUrl)');
  });

  it('calls client.focus() after navigate for matched clients', () => {
    // navigate fires first (deep-link), focus fires after (activates window).
    const navigatePos = clickHandlerSrc.indexOf('client.navigate(targetUrl)');
    const focusPos = clickHandlerSrc.indexOf('client.focus()');
    expect(navigatePos).toBeGreaterThan(-1);
    expect(focusPos).toBeGreaterThan(navigatePos);
  });

  it('falls back to clients.openWindow when no matching client found', () => {
    expect(clickHandlerSrc).toContain('clients.openWindow(targetUrl)');
  });

  it('wraps navigate in try/catch (cross-origin / restricted URL safety)', () => {
    expect(clickHandlerSrc).toContain('try {');
    expect(clickHandlerSrc).toContain('} catch');
    // After catch, it still returns client.focus() — partial fallback preserved
    const catchPos = clickHandlerSrc.indexOf('} catch');
    const focusAfterCatch = clickHandlerSrc.indexOf('client.focus()', catchPos);
    expect(focusAfterCatch).toBeGreaterThan(catchPos);
  });

  it('closes the notification before taking action', () => {
    expect(clickHandlerSrc).toContain('event.notification.close()');
    const closePos = clickHandlerSrc.indexOf('event.notification.close()');
    const navigatePos = clickHandlerSrc.indexOf('client.navigate(targetUrl)');
    expect(closePos).toBeLessThan(navigatePos);
  });
});
