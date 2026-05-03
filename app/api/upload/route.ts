import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users, kids } from '@/lib/db/schema';
import { requireHousehold } from '@/lib/auth/household';
import { stripExif } from '@/lib/strip-exif';
import { verifyImageMagicBytes } from '@/lib/upload/sniff';
import { apiError, authError } from '@/lib/api-error';

export async function POST(req: NextRequest) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error('[api:upload] BLOB_READ_WRITE_TOKEN is not set — photo storage unavailable');
    return NextResponse.json({ error: 'Photo storage not configured' }, { status: 503 });
  }

  let household: Awaited<ReturnType<typeof requireHousehold>>['household'];
  let user: Awaited<ReturnType<typeof requireHousehold>>['user'];
  try {
    ({ household, user } = await requireHousehold());
  } catch (err) {
    return authError(err, 'upload');
  }

  try {
    // Rate limit: 30 uploads per hour per user
    const { rateLimit, rateLimitResponse } = await import('@/lib/ratelimit');
    const rl = rateLimit({ key: `upload:${user.id}`, limit: 30, windowMs: 60 * 60_000 });
    const limited = rateLimitResponse(rl);
    if (limited) return limited;

    const form = await req.formData();
    const file = form.get('file') as File | null;
    const targetType = form.get('type') as string | null; // 'user' | 'kid'
    const targetId = form.get('id') as string | null;

    if (!file || !targetType || !targetId) {
      return NextResponse.json({ error: 'file, type, and id required' }, { status: 400 });
    }

    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
    const allowed = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
    if (!allowed.includes(ext)) {
      return NextResponse.json({ error: 'Image files only (jpg, png, webp, gif)' }, { status: 400 });
    }
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'Max file size is 5 MB' }, { status: 400 });
    }

    // Read bytes first — magic-byte check before any further processing
    const rawBuf = Buffer.from(await file.arrayBuffer());

    const sniff = verifyImageMagicBytes(rawBuf, ext);
    if (!sniff.ok) {
      console.warn(`[api:upload] magic-byte mismatch: ${sniff.reason} (file=${file.name}, type=${file.type})`);
      return NextResponse.json({ error: 'bad_content_type' }, { status: 400 });
    }

    // Strip metadata. contentType is sourced from verified bytes, NOT file.type.
    const cleanBuf = stripExif(rawBuf, ext);
    const verifiedContentType = sniff.mime;

    const pathname = `covey/${household.id}/${targetType}-${targetId}.${ext}`;
    console.log(`[api:upload] putting blob: ${pathname} (${cleanBuf.length}b, contentType=${verifiedContentType})`);
    let url: string;
    try {
      ({ url } = await put(pathname, cleanBuf, {
        access: 'private',
        contentType: verifiedContentType,
      }));
    } catch (blobErr) {
      console.error('[api:upload] @vercel/blob put failed:', blobErr instanceof Error ? blobErr.message : blobErr);
      throw blobErr;
    }

    if (targetType === 'user') {
      await db.update(users)
        .set({ photoUrl: url })
        .where(and(eq(users.id, targetId), eq(users.householdId, household.id)));
    } else if (targetType === 'kid') {
      await db.update(kids)
        .set({ photoUrl: url })
        .where(and(eq(kids.id, targetId), eq(kids.householdId, household.id)));
    } else {
      return NextResponse.json({ error: 'type must be user or kid' }, { status: 400 });
    }

    // Return the proxy path, not the raw blob URL.
    // The blob is private; callers must use /api/photo/[id] to render it.
    const photoPath = `/api/photo/${targetId}`;
    return NextResponse.json({ url: photoPath });
  } catch (err) {
    return apiError(err, 'Upload failed', 500, 'upload');
  }
}
