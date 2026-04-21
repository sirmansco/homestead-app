import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users, kids } from '@/lib/db/schema';
import { requireHousehold } from '@/lib/auth/household';

export async function POST(req: NextRequest) {
  try {
    const { household, user } = await requireHousehold();

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

    const pathname = `homestead/${household.id}/${targetType}-${targetId}.${ext}`;
    const { url } = await put(pathname, file, { access: 'public', addRandomSuffix: false });

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

    return NextResponse.json({ url });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
