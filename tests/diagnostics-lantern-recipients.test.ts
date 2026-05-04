import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// BUG-B regression: when Matthew lit the lantern on prod, no push fired.
// Logs showed zero `push_batch` lines and zero `/api/lantern` POSTs across 7 days,
// not because delivery was broken but because notify.ts:notifyLanternLit returns
// early at innerCircle.length === 0 without calling pushToUsers — and that
// early return emits no log line, leaving "did push attempt anything?" invisible.
//
// The diagnostics route now reports who would receive a lantern push for the
// caller's household, mirroring notifyLanternLit's WHERE clause exactly. The
// regression net here is structural: the diagnostic must keep the same filters
// as notify.ts, so future drift in either side stays observable.

const APP_ROOT = join(__dirname, '..');
const DIAGNOSTICS = join(APP_ROOT, 'app', 'api', 'diagnostics', 'route.ts');
const NOTIFY = join(APP_ROOT, 'lib', 'notify.ts');

describe('Diagnostics reports lantern recipients matching notify.ts (BUG-B)', () => {
  const diagSrc = readFileSync(DIAGNOSTICS, 'utf8');
  const notifySrc = readFileSync(NOTIFY, 'utf8');

  it('exposes a lanternRecipients block in the response', () => {
    expect(/lanternRecipients/.test(diagSrc)).toBe(true);
  });

  it("uses the same eligibility filters as notify.ts:notifyLanternLit", () => {
    // notifyLanternLit filters by: role='watcher', villageGroup IN ['covey','inner_circle']
    // (transitional read-compat shim added in B4), notifyLanternLit=true.
    // The diagnostic must mirror this exactly so its verdict matches what a real
    // push attempt would see.
    expect(/eq\(users\.role,\s*'watcher'\)/.test(diagSrc)).toBe(true);
    // B4 shim: inArray replaces eq for village_group to include legacy inner_circle rows
    expect(/inArray\(users\.villageGroup,\s*\[['"]covey['"],\s*['"]inner_circle['"]\]\)/.test(diagSrc)).toBe(true);
    expect(/eq\(users\.notifyLanternLit,\s*true\)/.test(diagSrc)).toBe(true);

    // Cross-check: notifyLanternLit must also still use the same filter — if it drifts,
    // the diagnostic's verdict becomes a lie.
    expect(/eq\(users\.role,\s*'watcher'\)/.test(notifySrc)).toBe(true);
    expect(/inArray\(users\.villageGroup,\s*\[['"]covey['"],\s*['"]inner_circle['"]\]\)/.test(notifySrc)).toBe(true);
    expect(/eq\(users\.notifyLanternLit,\s*true\)/.test(notifySrc)).toBe(true);
  });

  it('reports an explicit verdict string for each silent-no-op cause', () => {
    // The whole point of the diagnostic is to turn silent no-ops into
    // observable states. Each return path must name the cause.
    expect(/household_has_only_one_member/.test(diagSrc)).toBe(true);
    expect(/no_eligible_inner_circle_caregivers/.test(diagSrc)).toBe(true);
    expect(/eligible_caregivers_have_no_push_subscriptions/.test(diagSrc)).toBe(true);
  });

  it('counts push_subscriptions for the eligible inner circle', () => {
    // Without this, "eligible caregivers exist but no one is subscribed" looks
    // identical to "push delivery failed" — exactly the confusion BUG-B started in.
    expect(/eligibleInnerCircleSubscriptions/.test(diagSrc)).toBe(true);
    expect(/pushSubscriptions/.test(diagSrc)).toBe(true);
  });
});
