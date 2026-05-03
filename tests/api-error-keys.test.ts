import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

// Source-grep style: assert canonical error key strings are present and the
// old free-text strings are absent in the four fixed routes.

const API_ROOT = path.join(process.cwd(), 'app/api');

function read(rel: string) {
  return readFileSync(path.join(API_ROOT, rel), 'utf8');
}

describe('lantern/cron/route.ts — L8 fix', () => {
  const src = read('lantern/cron/route.ts');

  it('uses canonical not_signed_in key', () => {
    expect(src).toContain("'not_signed_in'");
  });

  it('does not use old Unauthorized string', () => {
    expect(src).not.toContain("'Unauthorized'");
  });
});

describe('lantern/[id]/escalate/route.ts — L8 fix', () => {
  const src = read('lantern/[id]/escalate/route.ts');

  it('uses canonical no_access key for household mismatch', () => {
    expect(src).toContain("'no_access'");
  });

  it('does not use old wrong household string', () => {
    expect(src).not.toContain("'wrong household'");
  });
});

describe('whistles/route.ts POST — L8 fix', () => {
  const src = read('whistles/route.ts');

  it('uses canonical no_access key for role check', () => {
    expect(src).toContain("'no_access'");
  });

  it('does not contain the old free-text role error', () => {
    // Old pattern: Only <keepers> can post <whistles>
    expect(src).not.toMatch(/Only.*can post/);
  });
});

describe('lantern/[id]/respond/route.ts — L8 fix', () => {
  const src = read('lantern/[id]/respond/route.ts');

  it('uses canonical no_access key for membership check', () => {
    expect(src).toContain("'no_access'");
  });

  it('does not use old Not a member string', () => {
    expect(src).not.toContain('Not a member');
  });
});
