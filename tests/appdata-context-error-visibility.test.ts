import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// L29 regression: AppDataContext.tsx had three bare `catch {}` blocks on the
// bell, shifts, and village polling fetches. Sentry's global handlers do not
// see errors consumed inside try/catch — all three endpoints silently
// swallowed 5xx, leaving operations blind to client-side fetch failures.
//
// We verify the source-level invariant: each catch site captures the error
// to Sentry with a stable `source` tag and emits a console.warn line.
// Source-text test mirrors the existing pattern in this codebase (see
// notify-resend-error-logging.test.ts and lantern-caregiver-visibility.test.ts)
// — no React Testing Library is installed, and Plan §7 forbids new deps.
//
// Mentally reverting any one of the three Sentry.captureException calls
// (back to bare `catch {}`) must turn the corresponding test red.
//
// NOTE: the literal `source` tag strings ("appdata:bell", "appdata:village",
// "appdata:shifts:${scope}") are part of the Sentry dashboard contract.
// Renaming them is a breaking change for any saved Sentry filter/alert that
// references the tag — not a cosmetic refactor. This test is deliberately
// over-coupled to the literal so that a rename surfaces here before it
// silently breaks ops dashboards.

const APP_ROOT = join(__dirname, '..');
const CONTEXT = join(APP_ROOT, 'app', 'context', 'AppDataContext.tsx');

describe('AppDataContext polling error visibility (L29)', () => {
  const src = readFileSync(CONTEXT, 'utf8');

  it('imports Sentry from @sentry/nextjs', () => {
    const importPattern = /import\s+\*\s+as\s+Sentry\s+from\s+['"]@sentry\/nextjs['"]/;
    expect(
      importPattern.test(src),
      'AppDataContext.tsx must import Sentry so the polling catches can captureException.'
    ).toBe(true);
  });

  it('contains no bare `catch {}` blocks (the L29 root cause)', () => {
    // Bare catch with empty body — the exact shape the audit flagged.
    // Allow whitespace and an optional comment between the braces, but the
    // body must contain at least one statement (Sentry/console call).
    const barePattern = /\}\s*catch\s*\{\s*(?:\/\/[^\n]*\n\s*)*\}/;
    expect(
      barePattern.test(src),
      'AppDataContext.tsx contains a bare `catch {}` — L29 regression. Every polling catch must captureException + console.warn.'
    ).toBe(false);
  });

  it('captures bell polling errors to Sentry with source tag appdata:bell', () => {
    const pattern = /Sentry\.captureException\([^)]*\{\s*tags:\s*\{\s*source:\s*['"]appdata:bell['"]/;
    expect(
      pattern.test(src),
      'Bell polling catch must call Sentry.captureException(err, { tags: { source: "appdata:bell" } }).'
    ).toBe(true);
  });

  it('captures shifts polling errors to Sentry with source tag appdata:shifts:${scope}', () => {
    // The scope is interpolated, so look for the template literal form.
    const pattern = /Sentry\.captureException\([^)]*\{\s*tags:\s*\{\s*source:\s*`appdata:shifts:\$\{scope\}`/;
    expect(
      pattern.test(src),
      'Shifts polling catch must call Sentry.captureException(err, { tags: { source: `appdata:shifts:${scope}` } }).'
    ).toBe(true);
  });

  it('captures village polling errors to Sentry with source tag appdata:village', () => {
    const pattern = /Sentry\.captureException\([^)]*\{\s*tags:\s*\{\s*source:\s*['"]appdata:village['"]/;
    expect(
      pattern.test(src),
      'Village polling catch must call Sentry.captureException(err, { tags: { source: "appdata:village" } }).'
    ).toBe(true);
  });

  it('emits a console.warn line per catch site for local debuggability', () => {
    // Three call sites; tag prefixes [appdata:bell], [appdata:shifts:..., [appdata:village].
    expect(/console\.warn\(\s*['"`]\[appdata:bell\]/.test(src)).toBe(true);
    expect(/console\.warn\(\s*[`'"]\[appdata:shifts:/.test(src)).toBe(true);
    expect(/console\.warn\(\s*['"`]\[appdata:village\]/.test(src)).toBe(true);
  });
});
