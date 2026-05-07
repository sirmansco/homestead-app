import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

const src = readFileSync(
  path.resolve(__dirname, '../app/components/ScreenCircle.tsx'),
  'utf8',
);

// Extract only the chicks rendering block (chicks.map call with MemberCard entries).
const kidsSection = (() => {
  const start = src.indexOf('{chicks.map');
  if (start === -1) return '';
  const end = src.indexOf('))}\n', start) + 4;
  return src.slice(start, end);
})();

describe('Kid avatar upload wiring — ScreenVillage', () => {
  it('kid cards pass targetType="kid" to MemberCard', () => {
    expect(kidsSection).toContain('targetType="kid"');
  });

  it('kid cards pass targetId={k.id} to MemberCard', () => {
    expect(kidsSection).toContain('targetId={k.id}');
  });

  it('kid cards pass onPhotoChange callback', () => {
    expect(kidsSection).toContain('onPhotoChange');
  });

  it('upload button renders when targetType + targetId are present (MemberCard source)', () => {
    const cardStart = src.indexOf('function MemberCard(');
    const nextFn = src.indexOf('\nfunction ', cardStart + 1);
    const cardSrc = src.slice(cardStart, nextFn);

    // The button to trigger file input is gated on targetType && targetId
    expect(cardSrc).toContain('targetType && targetId');
    // The hidden file input exists
    expect(cardSrc).toContain('type="file"');
    expect(cardSrc).toMatch(/accept="image\//);
  });

  it('uploadPhoto helper uses type=kid-compatible FormData fields', () => {
    // The shared helper must pass 'type' and 'id' fields that /api/upload expects
    const helperStart = src.indexOf('async function uploadPhoto(');
    const helperEnd = src.indexOf('\n}', helperStart) + 2;
    const helperSrc = src.slice(helperStart, helperEnd);

    expect(helperSrc).toContain("append('type'");
    expect(helperSrc).toContain("append('id'");
    expect(helperSrc).toContain("'/api/upload'");
  });

  it('kid cards do NOT gate upload on a role field', () => {
    // Constraint: chicks may not have a role field — upload must not be gated on it
    // The chicks.map block should not reference .role before the targetType/targetId props
    const kidsMapStart = kidsSection.indexOf('{chicks.map');
    const targetTypePos = kidsSection.indexOf('targetType="kid"', kidsMapStart);
    const roleGate = kidsSection.indexOf('.role', kidsMapStart);

    // Either no .role reference at all, or it appears after targetType
    if (roleGate !== -1) {
      expect(roleGate).toBeGreaterThan(targetTypePos);
    } else {
      expect(targetTypePos).toBeGreaterThan(-1);
    }
  });
});
