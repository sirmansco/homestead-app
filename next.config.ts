import type { NextConfig } from "next";
import { withSentryConfig } from '@sentry/nextjs';
const sha = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || 'dev';

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_SHA: sha,
  },
  async rewrites() {
    return [
      {
        // Route /sw.js to the dynamic handler that embeds the deploy SHA.
        // public/sw.dev.js is kept as a local dev reference only — not served.
        source: '/sw.js',
        destination: '/api/sw-script',
      },
    ];
  },
  async headers() {
    return [
      {
        // HTML pages — never cache; always revalidate so iOS PWA picks up new deploys
        source: '/((?!_next/static|_next/image|favicon|icon|manifest).*)',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Pragma',        value: 'no-cache' },
          { key: 'Expires',       value: '0' },
        ],
      },
      {
        // Service worker must never be cached — browser needs to check for updates
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  org: 'sirmans-co',
  project: 'covey',
  // Upload source maps only in CI to avoid slowing local builds
  silent: !process.env.CI,
  widenClientFileUpload: true,
  disableLogger: true,
  automaticVercelMonitors: false,
});
