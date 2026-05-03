import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

// Regression: ScreenCircle.myRole was stored as useState initialized from roleProp
// and never re-synced when the prop changed. TAB_SCREENS keeps ScreenCircle mounted
// permanently (display:none toggle), so role prop updates after initial mount (async
// API resolution, dev role switcher) were silently ignored — parents saw CaregiverVillage
// and caregivers saw the parent circle view.
//
// Fix: myRole is a derived const (roleProp ?? 'keeper'), not state. No sync needed.

const src = readFileSync(
  path.resolve(__dirname, '../app/components/ScreenCircle.tsx'),
  'utf8',
);

const circleStart = src.indexOf('export function ScreenCircle(');
const circleSrc = src.slice(circleStart);

describe('ScreenCircle — role is derived, not state', () => {
  it('myRole is a derived const, not useState', () => {
    expect(circleSrc).toContain("const myRole: AppRole = roleProp ??");
    expect(circleSrc).not.toContain("useState<AppRole>");
  });

  it('does not call setMyRole anywhere (no stale-closure risk)', () => {
    expect(circleSrc).not.toContain('setMyRole');
  });

  it('defaults to keeper when roleProp is absent', () => {
    expect(circleSrc).toContain("roleProp ?? 'keeper'");
  });

  it('WatcherVillage early-return uses myRole derived from prop', () => {
    expect(circleSrc).toContain("myRole === 'watcher'");
  });
});
