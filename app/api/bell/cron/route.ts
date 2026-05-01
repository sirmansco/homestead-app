import { NextRequest, NextResponse } from 'next/server';
import { and, eq, isNull, lte } from 'drizzle-orm';
import { db } from '@/lib/db';
import { bells } from '@/lib/db/schema';
import { escalateBell } from '@/lib/bell-escalation';

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const fiveMinutesAgo = new Date(Date.now() - 5 * 60_000);
  const due = await db.select().from(bells)
    .where(and(
      eq(bells.status, 'ringing'),
      isNull(bells.escalatedAt),
      lte(bells.createdAt, fiveMinutesAgo),
    ));

  const results = await Promise.allSettled(
    due.map(bell => escalateBell(bell.id))
  );

  const failed = results.filter(r => r.status === 'rejected');
  if (failed.length > 0) {
    console.error('[bell:cron] escalation errors', failed.map(f => (f as PromiseRejectedResult).reason));
  }

  return NextResponse.json({ processed: due.length, failed: failed.length });
}
