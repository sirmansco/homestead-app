import { describe, it, expect } from 'vitest';
import { readdirSync } from 'fs';
import { join } from 'path';

// L11 regression: scripts/migrate-*.ts files must not contain schema DDL
// outside drizzle/. After deleting the three legacy files, this test should
// pass trivially. The value is that it would catch a future re-introduction.

const SCRIPTS = join(__dirname, '..', 'scripts');

describe('L11 — no legacy DDL scripts outside drizzle/', () => {
  it('scripts/migrate-chicks.ts does not exist', () => {
    const files = readdirSync(SCRIPTS);
    expect(files).not.toContain('migrate-chicks.ts');
  });

  it('scripts/migrate-whistles.ts does not exist', () => {
    const files = readdirSync(SCRIPTS);
    expect(files).not.toContain('migrate-whistles.ts');
  });

  it('scripts/migrate-users-unique.ts does not exist', () => {
    const files = readdirSync(SCRIPTS);
    expect(files).not.toContain('migrate-users-unique.ts');
  });

  it('scripts/migrate.ts still exists (break-glass migrate entrypoint)', () => {
    const files = readdirSync(SCRIPTS);
    expect(files).toContain('migrate.ts');
  });
});
