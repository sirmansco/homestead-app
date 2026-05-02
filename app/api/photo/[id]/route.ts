import { NextRequest, NextResponse } from 'next/server';
import { get } from '@vercel/blob';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users, kids } from '@/lib/db/schema';
import { requireHousehold } from '@/lib/auth/household';
import { authError, apiError } from '@/lib/api-error';

// Authenticated proxy for household photos.
// Resolves the photo URL from `users` or `kids` row, verifies household
// ownership, then streams the blob bytes to the caller.
//
// Handles both old public blobs (access: 'public') and new private blobs
// (access: 'private') during the migration period. Private blobs store a
// Vercel private URL pattern; public blobs store a public CDN URL.
// After all rows are migrated, the public-fallback path can be removed.
//
// Cache-Control: private, max-age=3600 — per-session browser caching to
// avoid a round-trip on every render while keeping the blob unguessable.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let household: Awaited<ReturnType<typeof requireHousehold>>['household'];
  try {
    ({ household } = await requireHousehold());
  } catch (err) {
    return authError(err, 'photo');
  }

  try {
    // Look up photo URL in users first, then kids — both scoped to the caller's household
    let photoUrl: string | null = null;

    const [userRow] = await db.select({ photoUrl: users.photoUrl })
      .from(users)
      .where(and(eq(users.id, id), eq(users.householdId, household.id)))
      .limit(1);

    if (userRow) {
      photoUrl = userRow.photoUrl;
    } else {
      const [kidRow] = await db.select({ photoUrl: kids.photoUrl })
        .from(kids)
        .where(and(eq(kids.id, id), eq(kids.householdId, household.id)))
        .limit(1);
      if (kidRow) {
        photoUrl = kidRow.photoUrl;
      }
    }

    // No row in the caller's household for this id → 404
    if (!photoUrl) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }

    // Determine access type from URL pattern.
    // Private blobs have a Vercel Blob token fragment in the URL; public blobs
    // do not. During migration both exist. After backfill, only 'private' remains.
    const isPrivate = photoUrl.includes('?token=') || photoUrl.includes('&token=') ||
      // Vercel private blob URLs contain a signed path component
      /\/private\//.test(photoUrl);

    let stream: ReadableStream<Uint8Array> | null = null;
    let contentType = 'image/jpeg';
    let contentLength: number | null = null;
    let etag: string | null = null;

    if (isPrivate) {
      const result = await get(photoUrl, { access: 'private' });
      if (!result) {
        console.warn(`[api:photo] private blob not found id=${id}`);
        return NextResponse.json({ error: 'not_found' }, { status: 404 });
      }
      if (result.statusCode === 304) {
        return new NextResponse(null, {
          status: 304,
          headers: { 'Cache-Control': 'private, max-age=3600' },
        });
      }
      stream = result.stream as ReadableStream;
      contentType = result.blob.contentType ?? 'image/jpeg';
      contentLength = result.blob.size ?? null;
      etag = result.headers.get('etag');
    } else {
      // Legacy public blob — fetch directly from the CDN URL
      const res = await fetch(photoUrl);
      if (!res.ok || !res.body) {
        console.warn(`[api:photo] public blob fetch failed id=${id} status=${res.status}`);
        return NextResponse.json({ error: 'not_found' }, { status: 404 });
      }
      stream = res.body as ReadableStream;
      contentType = res.headers.get('content-type') ?? 'image/jpeg';
      const cl = res.headers.get('content-length');
      contentLength = cl ? parseInt(cl, 10) : null;
      etag = res.headers.get('etag');
    }

    const headers: Record<string, string> = {
      'Content-Type': contentType,
      'Cache-Control': 'private, max-age=3600',
    };
    if (contentLength) headers['Content-Length'] = String(contentLength);
    if (etag) headers['ETag'] = etag;

    return new NextResponse(stream, { status: 200, headers });
  } catch (err) {
    return apiError(err, 'Photo fetch failed', 500, 'photo');
  }
}
