import { NextResponse } from 'next/server';

// Temporary probe — delete after confirming COVEY_BRAND_ACTIVE runtime value
export async function GET() {
  return NextResponse.json({
    COVEY_BRAND_ACTIVE: process.env.COVEY_BRAND_ACTIVE ?? '(unset)',
    NODE_ENV: process.env.NODE_ENV,
    VERCEL_ENV: process.env.VERCEL_ENV,
  });
}
