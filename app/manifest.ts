import type { MetadataRoute } from 'next';
import { getCopy } from '@/lib/copy';

export default function manifest(): MetadataRoute.Manifest {
  const t = getCopy();
  const coveyActive = process.env.NEXT_PUBLIC_COVEY_BRAND_ACTIVE === 'true';
  if (coveyActive) {
    return {
      name: t.brand.name,
      short_name: t.brand.name,
      description: 'The small, watching circle around your children.',
      start_url: '/',
      display: 'standalone',
      orientation: 'portrait',
      background_color: '#E8DFCE',
      theme_color: '#E8DFCE',
      icons: [
        { src: '/icons/covey-icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icons/covey-icon-512.png', sizes: '512x512', type: 'image/png' },
        { src: '/icons/covey-icon-192-maskable.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
        { src: '/icons/covey-icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
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
