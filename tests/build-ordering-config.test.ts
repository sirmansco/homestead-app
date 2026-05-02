import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// L30 regression: vercel.json buildCommand must NOT invoke db:migrate.
// The old pattern ("npm run db:migrate && next build") runs migrations BEFORE
// the build succeeds — if build fails after migration, production has new schema
// and old code (inverted partial deploy). Migrations must run after build.
//
// package.json must declare engines to pin Node/npm version.

const VERCEL_JSON = JSON.parse(readFileSync(join(__dirname, '..', 'vercel.json'), 'utf8'));
const PKG = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));

describe('L30 — build ordering config', () => {
  it('vercel.json buildCommand does not invoke db:migrate', () => {
    const buildCmd = VERCEL_JSON.buildCommand ?? '';
    expect(buildCmd).not.toContain('db:migrate');
    expect(buildCmd).not.toContain('migrate');
  });

  it('vercel.json buildCommand is set to next build (or equivalent)', () => {
    const buildCmd = VERCEL_JSON.buildCommand ?? '';
    expect(buildCmd).toContain('next build');
  });

  it('package.json has engines.node pin', () => {
    expect(PKG.engines).toBeDefined();
    expect(PKG.engines.node).toBeDefined();
    expect(typeof PKG.engines.node).toBe('string');
  });

  it('package.json engines.node targets node 22', () => {
    expect(PKG.engines.node).toContain('22');
  });
});
