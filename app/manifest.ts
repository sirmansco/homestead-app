import type { MetadataRoute } from 'next';
import { getCopy } from '@/lib/copy';

export const dynamic = 'force-dynamic';

export default function manifest(): MetadataRoute.Manifest {
  const t = getCopy();
  const coveyActive = process.env.COVEY_BRAND_ACTIVE === 'true';
  if (coveyActive) {
    return {
      name: t.brand.name,
      short_name: t.brand.name,
      description: 'The small, watching circle around your children.',
      start_url: '/',
      display: 'standalone',
      orientation: 'portrait',
      // Q3: dark splash so iOS/Android cold launch in system dark mode no
      // longer flashes cream before paint. Light-mode users see a brief
      // dark frame instead — the inverse (cream → dark) was the worse jar.
      background_color: '#22271F',
      theme_color: '#E8DFCE',
      icons: [
        { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        { src: '/icons/icon-192-maskable.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
        { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    };
  }

  return {
    name: t.brand.name,
    short_name: t.brand.name,
    description: 'Family childcare coordination',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#FBF7F0',
    theme_color: '#FBF7F0',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-192-maskable.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
