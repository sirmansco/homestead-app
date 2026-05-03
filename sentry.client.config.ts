import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.VERCEL_ENV ?? 'development',
  release: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7),
  tracesSampleRate: 0.1,
  // Only send errors in production to avoid noise during dev
  enabled: process.env.NODE_ENV === 'production',
});

if (process.env.NODE_ENV === 'production' && !process.env.NEXT_PUBLIC_SENTRY_DSN) {
  console.warn('[sentry] NEXT_PUBLIC_SENTRY_DSN not set — client-side errors will not be reported');
}
