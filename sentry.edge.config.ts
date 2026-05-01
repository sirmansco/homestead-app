import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.VERCEL_ENV ?? 'development',
  release: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7),
  tracesSampleRate: 0.1,
  enabled: process.env.NODE_ENV === 'production',
});
