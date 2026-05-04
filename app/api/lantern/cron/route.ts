import { NextRequest, NextResponse } from 'next/server';
import { and, eq, isNull, lte } from 'drizzle-orm';
import { db } from '@/lib/db';
import { lanterns } from '@/lib/db/schema';
import { escalateLantern } from '@/lib/lantern-escalation';

const BATCH_LIMIT = 50;
const CONCURRENCY = 10;

// Bounded fan-out: at most `limit` workers in flight at once. Mirrors
// Promise.allSettled's return shape so callers can keep their existing
// rejected/fulfilled discrimination.
async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let cursor = 0;
  async function next(): Promise<void> {
    while (cursor < items.length) {
      const idx = cursor++;
      try {
        results[idx] = { status: 'fulfilled', value: await worker(items[idx]) };
      } catch (reason) {
        results[idx] = { status: 'rejected', reason };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => next()));
  return results;
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'not_signed_in' }, { status: 401 });
  }

  const fiveMinutesAgo = new Date(Date.now() - 5 * 60_000);
  const due = await db.select().from(lanterns)
    .where(and(
      eq(lanterns.status, 'ringing'),
      isNull(lanterns.escalatedAt),
      lte(lanterns.createdAt, fiveMinutesAgo),
    ))
    .limit(BATCH_LIMIT);

  const results = await runWithConcurrency(due, CONCURRENCY, lantern => escalateLantern(lantern.id));

  const failed = results.filter(r => r.status === 'rejected');
  const processed = due.length;
  // The select uses LIMIT, so `processed` is the per-tick count, not the global
  // backlog size. We don't surface eligible_total — counting it would require a
  // second SELECT COUNT(*) every minute. The bound itself is the safety belt;
  // backlog drain is observable via successive ticks reporting processed=50.
  console.log(JSON.stringify({
    event: 'lantern_cron',
    processed,
    failed: failed.length,
    batch_limit: BATCH_LIMIT,
    concurrency: CONCURRENCY,
  }));

  if (failed.length > 0) {
    console.error('[lantern:cron] escalation errors', failed.map(f => (f as PromiseRejectedResult).reason));
  }

  return NextResponse.json({ processed, failed: failed.length });
}
