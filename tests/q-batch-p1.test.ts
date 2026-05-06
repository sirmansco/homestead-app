import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// Q-batch (Q1–Q8) regression coverage. Most items are source-grep
// falsifiability gates because the changes are either copy/styling
// (no observable behavior in vitest) or tiny route additions where
// the load-bearing assertion is "this code path exists at all."

const root = path.resolve(__dirname, '..');
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf-8');

describe('Q1 — calToken rotation endpoint + Settings button', () => {
  it('exports a DELETE handler from app/api/whistles/ical/route.ts', () => {
    const src = read('app/api/whistles/ical/route.ts');
    expect(src).toMatch(/export\s+async\s+function\s+DELETE\s*\(/);
    // Body must regenerate the token (random bytes) and persist via update.
    expect(src).toMatch(/crypto\.randomBytes/);
    expect(src).toMatch(/\.update\(users\)/);
    // Rate limited to prevent abuse.
    expect(src).toMatch(/rateLimit\(\{[^}]*key:\s*`cal-token-rotate:/);
  });

  it('ScreenSettings has a Rotate URL button wired to DELETE /api/whistles/ical', () => {
    const src = read('app/components/ScreenSettings.tsx');
    expect(src).toMatch(/handleRotateCalFeed/);
    expect(src).toMatch(/method:\s*['"]DELETE['"]/);
    // Confirmation prompt before destructive rotation.
    expect(src).toMatch(/confirm\(/);
  });
});

describe('Q2 — Reply-To header on email send', () => {
  it('lib/notify.ts send() includes reply_to in the Resend POST body', () => {
    const src = read('lib/notify.ts');
    // Match the Resend payload key (snake_case per their API).
    expect(src).toMatch(/reply_to:\s*replyTo/);
    // replyTo derives from env override or copy.contact.
    expect(src).toMatch(/NOTIFY_REPLY_TO/);
    expect(src).toMatch(/t\.emails\.contact/);
  });
});

describe('Q3 — manifest dark background_color', () => {
  it('Covey-active manifest branch uses a dark background_color (not cream)', () => {
    const src = read('app/manifest.ts');
    // background_color must be the dark token; theme_color cream (address-bar
    // accent) is fine to leave alone, so we don't assert its value.
    expect(src).toMatch(/background_color:\s*['"]#22271F['"]/);
    // The cream hex must no longer appear as a background_color anywhere
    // inside the covey-active branch (theme_color uses it deliberately).
    expect(src).not.toMatch(/background_color:\s*['"]#E8DFCE['"]/);
  });
});

describe('Q4 — sign-up + setup pages use CSS vars', () => {
  it('sign-up page replaces hardcoded hex with CSS vars', () => {
    const src = read('app/sign-up/[[...sign-up]]/page.tsx');
    expect(src).not.toMatch(/['"]#E8DFCE['"]/);
    expect(src).not.toMatch(/['"]#4A5340['"]/);
    expect(src).not.toMatch(/['"]#7A6A4F['"]/);
    expect(src).not.toMatch(/['"]#F4EFE3['"]/);
    expect(src).toMatch(/var\(--bg\)/);
    expect(src).toMatch(/var\(--green\)/);
    expect(src).toMatch(/var\(--muted\)/);
    expect(src).toMatch(/var\(--paper\)/);
  });

  it('setup page replaces "#fff" with var(--paper)', () => {
    const src = read('app/setup/page.tsx');
    expect(src).not.toMatch(/background:\s*['"]#fff['"]/);
    // Two instances: input bg + glyph button non-selected bg.
    expect(src.match(/var\(--paper\)/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });
});

describe('Q5 — --mustard-rgb defined in all three :root blocks', () => {
  it('globals.css defines --mustard-rgb in light root, media-query dark, and explicit dark', () => {
    const src = read('app/globals.css');
    const matches = src.match(/--mustard-rgb:/g);
    expect(matches, '--mustard-rgb must appear in light, media-dark, and explicit-dark blocks').toBeTruthy();
    expect(matches!.length).toBe(3);
  });
});

describe('Q6 — fmtWhen branches on hour', () => {
  it('ScreenWhistles fmtWhen uses s.getHours() < 17 to choose Today vs Tonight', () => {
    const src = read('app/components/ScreenWhistles.tsx');
    expect(src).toMatch(/s\.getHours\(\)\s*<\s*17/);
    expect(src).toMatch(/['"]Today['"]/);
    expect(src).toMatch(/['"]Tonight['"]/);
  });
});

describe('Q7 — Watcher ShiftCard star badge for targeted shifts', () => {
  it('ScreenWhistles ShiftCard renders a "Requested for you" badge when row.requestedForMe', () => {
    const src = read('app/components/ScreenWhistles.tsx');
    expect(src).toMatch(/row\.requestedForMe/);
    expect(src).toMatch(/Requested for you/);
  });
});

describe('Q8 — module-level getCopy() moved into component bodies', () => {
  it('ScreenSettings: PREF_LABELS replaced with buildPrefLabels() called per-render', () => {
    const src = read('app/components/ScreenSettings.tsx');
    expect(src).not.toMatch(/^const PREF_LABELS/m);
    expect(src).toMatch(/function buildPrefLabels\(\)/);
    expect(src).toMatch(/buildPrefLabels\(\)/);
  });

  it('accept-family-invite: GROUP_LABEL replaced with buildGroupLabel() called per-render', () => {
    const src = read('app/accept-family-invite/page.tsx');
    expect(src).not.toMatch(/^const GROUP_LABEL:/m);
    expect(src).toMatch(/function buildGroupLabel\(\)/);
    expect(src).toMatch(/buildGroupLabel\(\)/);
  });
});
