import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// L28 regression: .env.example must document Sentry vars so new deployments
// don't silently ship without error monitoring. sentry.server.config.ts must
// warn at startup if DSN is unset in production.

const ENV_EXAMPLE = readFileSync(join(__dirname, '..', '.env.example'), 'utf8');
const SENTRY_SERVER = readFileSync(join(__dirname, '..', 'sentry.server.config.ts'), 'utf8');

describe('L28 — Sentry configuration documented', () => {
  it('.env.example includes SENTRY_DSN', () => {
    expect(ENV_EXAMPLE).toContain('SENTRY_DSN');
  });

  it('.env.example includes SENTRY_ORG', () => {
    expect(ENV_EXAMPLE).toContain('SENTRY_ORG');
  });

  it('.env.example includes SENTRY_PROJECT', () => {
    expect(ENV_EXAMPLE).toContain('SENTRY_PROJECT');
  });

  it('.env.example includes SENTRY_AUTH_TOKEN', () => {
    expect(ENV_EXAMPLE).toContain('SENTRY_AUTH_TOKEN');
  });

  it('sentry.server.config.ts warns when SENTRY_DSN is absent in production', () => {
    expect(SENTRY_SERVER).toContain('SENTRY_DSN');
    expect(SENTRY_SERVER).toContain('console.warn');
  });
});
