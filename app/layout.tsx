import { Suspense } from 'react';
import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { ClerkProvider } from '@clerk/nextjs';
import { PushRegistrar } from './components/PushRegistrar';
import { AutoUpdate } from './components/AutoUpdate';
import { getCopy } from '@/lib/copy';
import { StaffToolbar } from './components/StaffToolbar';
import './globals.css';

export const dynamic = 'force-dynamic';

const APP_SHA = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || 'dev';

// Covey staging domains are attached to Vercel before TM clearance. Noindex
// them so search engines don't learn "Covey is at joincovey.co" during
// the staging window. Lifted automatically once COVEY_BRAND_ACTIVE goes true.
const COVEY_STAGING_HOSTS = new Set(['joincovey.co', 'thecovey.app']);

export async function generateMetadata(): Promise<Metadata> {
  const t = getCopy();
  const headersList = await headers();
  const host = headersList.get('host')?.split(':')[0] ?? '';
  const isCovetyStagingHost = COVEY_STAGING_HOSTS.has(host) && process.env.COVEY_BRAND_ACTIVE !== 'true';

  return {
    title: t.brand.name,
    description: 'Family childcare coordination',
    applicationName: t.brand.name,
    appleWebApp: {
      capable: true,
      statusBarStyle: 'black-translucent',
      title: t.brand.name,
    },
    formatDetection: { telephone: false },
    ...(isCovetyStagingHost && { robots: { index: false, follow: false } }),
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#E8DFCE' },
    { media: '(prefers-color-scheme: dark)',  color: '#1B1713' },
  ],
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en">
        <head>
          <meta name="app-sha" content={APP_SHA} />
          <link rel="apple-touch-icon" href="/icons/apple-touch-icon-covey.png" />
          {/* Blocking script — applies saved theme + background before first paint to prevent flash */}
          <script dangerouslySetInnerHTML={{ __html: `
(function(){
  try {
    var t = localStorage.getItem('covey-theme') || localStorage.getItem('homestead-theme');
    var dark = t === 'dark' || (t !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (t === 'dark' || t === 'light') document.documentElement.setAttribute('data-theme', t);
    document.documentElement.style.background = dark ? '#1F2420' : '#E8DFCE';
  } catch(e) {}
})();
          `.trim() }} />
        </head>
        <body>
          <AutoUpdate />
          <PushRegistrar />
          {children}
          <Suspense fallback={null}>
            <StaffToolbar />
          </Suspense>
        </body>
      </html>
    </ClerkProvider>
  );
}
