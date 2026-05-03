import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..');
const SHARED = path.join(root, 'app/components/shared.tsx');
const HOMESTEAD_APP = path.join(root, 'app/components/CoveyApp.tsx');
const LAYOUT = path.join(root, 'app/layout.tsx');

describe('bottom tab bar safe-area positioning', () => {
  it('GTabBar uses the actual safe-area inset without a hardcoded minimum gap', () => {
    const src = readFileSync(SHARED, 'utf-8');

    expect(src).toContain("paddingBottom: 'env(safe-area-inset-bottom, 0px)'");
    expect(src).not.toMatch(/paddingBottom:\s*['"]max\(env\(safe-area-inset-bottom,\s*34px\),\s*34px\)['"]/);
    expect(src).not.toMatch(/paddingBottom:\s*['"]max\(env\(safe-area-inset-bottom,\s*0px\),\s*8px\)['"]/);
  });

  it('mobile shell does not add a second bottom offset beneath the fixed GTabBar', () => {
    const src = readFileSync(HOMESTEAD_APP, 'utf-8');

    expect(src).toMatch(/position:\s*'fixed',\s*inset:\s*0/);
    expect(src).toContain('<GTabBar active={activeTab} onNavigate={navigate} role={role} bellCount={bellCount} />');
    expect(src).not.toMatch(/paddingBottom:\s*['"][^'"]*safe-area-inset-bottom/);
  });

  it('root viewport opts into edge-to-edge rendering for iOS safe-area env vars', () => {
    const src = readFileSync(LAYOUT, 'utf-8');

    expect(src).toContain("viewportFit: 'cover'");
  });
});
