import type { Metadata, Viewport } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import { PushRegistrar } from './components/PushRegistrar';
import { AutoUpdate } from './components/AutoUpdate';
import { getCopy } from '@/lib/copy';
import './globals.css';

const APP_SHA = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || 'dev';

// getCopy() is called at module evaluation time for metadata — this is fine for
// a server module because Next.js re-evaluates server modules per-request in dev
// and the env var is stable within a deployment in prod.
const t = getCopy();

export const metadata: Metadata = {
  title: t.brand.name,
  description: 'Family childcare coordination',
  applicationName: t.brand.name,
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: t.brand.name,
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: '#FBF7F0',
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en">
        <head>
          <meta name="app-sha" content={APP_SHA} />
          <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
          {/* Blocking script — applies saved theme before first paint to prevent flash */}
          <script dangerouslySetInnerHTML={{ __html: `
(function(){
  try {
    var t = localStorage.getItem('homestead-theme');
    if (t === 'dark' || t === 'light') {
      document.documentElement.setAttribute('data-theme', t);
    }
  } catch(e) {}
})();
          `.trim() }} />
        </head>
        <body>
          <AutoUpdate />
          <PushRegistrar />
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
