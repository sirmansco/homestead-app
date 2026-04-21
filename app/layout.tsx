import type { Metadata, Viewport } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import { PushRegistrar } from './components/PushRegistrar';
import './globals.css';

export const metadata: Metadata = {
  title: 'Homestead',
  description: 'Family childcare coordination',
  applicationName: 'Homestead',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Homestead',
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
        <body>
          <PushRegistrar />
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
