import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// C1 regression: the desktop sidebar copy "Design prototype" / "Oct 2025"
// must not ship to production. Falsifiability: re-adding either string to
// CoveyApp.tsx turns this red.

describe('C1 — pre-launch sidebar copy removed', () => {
  it('CoveyApp.tsx does not contain "Design prototype" or "Oct 2025"', () => {
    const src = readFileSync(
      path.resolve(__dirname, '..', 'app/components/CoveyApp.tsx'),
      'utf-8',
    );
    expect(src).not.toMatch(/Design prototype/);
    expect(src).not.toMatch(/Oct 2025/);
  });
});
