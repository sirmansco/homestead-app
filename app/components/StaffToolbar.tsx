'use client';

import { VercelToolbar } from '@vercel/toolbar/next';

export function StaffToolbar() {
  if (process.env.NEXT_PUBLIC_VERCEL_ENV !== 'preview') return null;
  return <VercelToolbar />;
}
