import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

// Matrix §2.1.2 regression: keeper-non-admin must not see the "Invite or add"
// button. Server-side /api/circle/invite-family returns 403 for keeper-non-admin
// (covered by circle-keeper-non-admin-cannot-invite-family.test.ts), but the UI
// previously rendered the button on the `myRole === 'keeper'` check alone,
// producing a silent failure when a non-admin keeper tapped it.
//
// Fix: gate both call sites on `canInvite = myRole === 'keeper' && isAdmin`,
// where isAdmin is read from /api/household's `user.isAdmin`.

const src = readFileSync(
  path.resolve(__dirname, '../app/components/ScreenCircle.tsx'),
  'utf8',
);

describe('ScreenCircle — keeper-non-admin sees no Invite button', () => {
  it('declares canInvite as keeper AND isAdmin', () => {
    expect(src).toContain("const canInvite = myRole === 'keeper' && isAdmin;");
  });

  it('reads isAdmin from /api/household response', () => {
    expect(src).toContain('setIsAdmin(Boolean(me.user?.isAdmin));');
  });

  it('both Invite-or-add buttons are gated on canInvite, not myRole alone', () => {
    const inviteButtonGates = src.match(/\{canInvite && \(\s*\n?\s*<button[^>]*onClick=\{\(\) => setShowInvite\(true\)\}/g);
    expect(inviteButtonGates?.length ?? 0).toBe(2);

    // Sanity: the old, unsafe gate must not survive on either invite button.
    expect(src).not.toMatch(/\{myRole === 'keeper' && \(\s*\n?\s*<button[^>]*onClick=\{\(\) => setShowInvite\(true\)\}/);
  });
});
