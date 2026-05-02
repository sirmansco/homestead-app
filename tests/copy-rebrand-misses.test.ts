import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..');

describe('rebrand copy — no hardcoded brand strings where copy system should be used', () => {
  it('ScreenCircle caregiver Covies view uses getCopy() for the kids section label, not hardcoded "Kids"', () => {
    const src = readFileSync(join(root, 'app/components/ScreenCircle.tsx'), 'utf8');
    // The caregiver Covies block (around line 590) must not contain a bare "Kids" string literal
    // in a GLabel — it must use getCopy().circle.kidLabel
    const hardcodedKids = />Kids</g;
    expect(hardcodedKids.test(src)).toBe(false);
  });

  it('ScreenLantern PushPermissionBanner uses role-aware copy, not hardcoded caregiver-blaming string', () => {
    const src = readFileSync(join(root, 'app/components/ScreenLantern.tsx'), 'utf8');
    // The caregiver variant must be present
    expect(src).toContain("alerted the moment a family lights the lantern");
    // The parent variant (for the parent-side banner) must still be present
    expect(src).toContain('Allow notifications so caregivers are alerted instantly');
  });

  it('ScreenLantern PushPermissionBanner accepts a role prop', () => {
    const src = readFileSync(join(root, 'app/components/ScreenLantern.tsx'), 'utf8');
    expect(src).toContain('role?: \'parent\' | \'caregiver\'');
    // Caregiver call site passes role="caregiver"
    expect(src).toContain('PushPermissionBanner role="caregiver"');
  });
});
