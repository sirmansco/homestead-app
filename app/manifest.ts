import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  const coveyActive = process.env.NEXT_PUBLIC_COVEY_BRAND_ACTIVE === 'true';
  if (coveyActive) {
    return {
      name: 'Covey',
      short_name: 'Covey',
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
    name: 'Homestead',
    short_name: 'Homestead',
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
