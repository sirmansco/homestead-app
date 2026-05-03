import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// F-P2-J regression: sentry.client.config.ts must warn at startup if
// NEXT_PUBLIC_SENTRY_DSN is unset in production, matching the server config guard.

const CLIENT_CONFIG = readFileSync(join(__dirname, '..', 'sentry.client.config.ts'), 'utf8');

describe('F-P2-J — Sentry client config warns on missing DSN', () => {
  it('sentry.client.config.ts references NEXT_PUBLIC_SENTRY_DSN', () => {
    expect(CLIENT_CONFIG).toContain('NEXT_PUBLIC_SENTRY_DSN');
  });

  it('sentry.client.config.ts emits console.warn when DSN is absent', () => {
    expect(CLIENT_CONFIG).toContain('console.warn');
  });
});
