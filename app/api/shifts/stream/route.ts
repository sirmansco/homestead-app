import { NextRequest } from 'next/server';
import { and, eq, gte, inArray, isNull, or, asc } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { clerkClient } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { shifts, users, households } from '@/lib/db/schema';
import { requireUser } from '@/lib/auth/household';
import { createHash } from 'crypto';

// Vercel Pro: stream for up to 5 minutes per connection
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const POLL_INTERVAL_MS = 3_000;

const claimerUsers = alias(users, 'claimer');

async function queryVillageShifts(userId: string): Promise<string> {
  const client = await clerkClient();
  const memberships = await client.users.getOrganizationMembershipList({ userId });
  const orgIds = memberships.data.map(m => m.organization.id);
  if (!orgIds.length) return JSON.stringify([]);

  const hhRows = await db.select().from(households).where(inArray(households.clerkOrgId, orgIds));
  const hhIds = hhRows.map(h => h.id);
  if (!hhIds.length) return JSON.stringify([]);

  const myUserRows = await db.select({ id: users.id })
    .from(users)
    .where(and(eq(users.clerkUserId, userId), inArray(users.householdId, hhIds)));
  const myUserIdForFilter = myUserRows[0]?.id ?? null;

  const where = and(
    inArray(shifts.householdId, hhIds),
    gte(shifts.endsAt, new Date()),
    or(
      eq(shifts.status, 'claimed'),
      and(
        eq(shifts.status, 'open'),
        or(
          isNull(shifts.preferredCaregiverId),
          ...(myUserIdForFilter ? [eq(shifts.preferredCaregiverId, myUserIdForFilter)] : []),
        ),
      ),
    ),
  );

  const rows = await db.select({
    shift: shifts,
    household: households,
    creator: { id: users.id, name: users.name },
    claimer: { id: claimerUsers.id, name: claimerUsers.name },
  })
    .from(shifts)
    .leftJoin(households, eq(shifts.householdId, households.id))
    .leftJoin(users, eq(shifts.createdByUserId, users.id))
    .leftJoin(claimerUsers, eq(shifts.claimedByUserId, claimerUsers.id))
    .where(where)
    .orderBy(asc(shifts.startsAt));

  return JSON.stringify(rows);
}

function hashPayload(payload: string): string {
  return createHash('sha1').update(payload).digest('hex').slice(0, 12);
}

export async function GET(req: NextRequest) {
  // Auth check before opening the stream
  let userId: string;
  try {
    const result = await requireUser();
    userId = result.userId;
  } catch {
    return new Response('Unauthorized', { status: 401 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let lastHash = '';
      let closed = false;

      req.signal.addEventListener('abort', () => {
        closed = true;
        try { controller.close(); } catch { /* already closed */ }
      });

      // Send an initial keepalive comment so the client knows the stream is alive
      controller.enqueue(encoder.encode(': connected\n\n'));

      while (!closed) {
        try {
          const payload = await queryVillageShifts(userId);
          const hash = hashPayload(payload);

          if (hash !== lastHash) {
            lastHash = hash;
            controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
          } else {
            // Keepalive comment every poll cycle to prevent proxy timeouts
            controller.enqueue(encoder.encode(': ping\n\n'));
          }
        } catch (err) {
          console.error('[shifts:stream] poll error', err instanceof Error ? err.message : String(err));
          // Send an error event so the client can reconnect
          controller.enqueue(encoder.encode('event: error\ndata: poll_failed\n\n'));
        }

        // Wait for next poll, or exit early if aborted
        await new Promise<void>(resolve => {
          const t = setTimeout(resolve, POLL_INTERVAL_MS);
          req.signal.addEventListener('abort', () => { clearTimeout(t); resolve(); }, { once: true });
        });
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
      Connection: 'keep-alive',
    },
  });
}
