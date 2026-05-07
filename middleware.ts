import { clerkMiddleware } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

export default clerkMiddleware(async (_auth, req) => {
  const requestId =
    req.headers.get('x-request-id') ??
    req.headers.get('x-vercel-id') ??
    crypto.randomUUID();

  const reqHeaders = new Headers(req.headers);
  reqHeaders.set('x-request-id', requestId);

  const res = NextResponse.next({ request: { headers: reqHeaders } });
  res.headers.set('x-request-id', requestId);
  return res;
});

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
