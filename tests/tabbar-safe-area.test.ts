import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const SHARED_TSX = path.resolve(__dirname, '..', 'app', 'components', 'shared.tsx');

describe('GTabBar / safe-area', () => {
  it('uses env(safe-area-inset-bottom, 0px) without a hardcoded floor', () => {
    const src = readFileSync(SHARED_TSX, 'utf-8');
    expect(src).toContain("paddingBottom: 'env(safe-area-inset-bottom, 0px)'");
  });

  it('does not reserve a 34px (or any other px) fallback floor on the tab bar', () => {
    const src = readFileSync(SHARED_TSX, 'utf-8');
    expect(src).not.toMatch(/paddingBottom:\s*['"]max\(env\(safe-area-inset-bottom/);
  });
});
