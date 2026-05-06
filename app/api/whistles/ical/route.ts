import { NextRequest, NextResponse } from 'next/server';
import { eq, and, inArray } from 'drizzle-orm';
import crypto from 'crypto';
import { db } from '@/lib/db';
import { whistles, users, households } from '@/lib/db/schema';
import { getCopy } from '@/lib/copy';
import { authError } from '@/lib/api-error';
import { rateLimit, rateLimitResponse } from '@/lib/ratelimit';

function escapeIcs(s: string) {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

function fmtIcsDate(d: Date) {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function buildIcs(events: { uid: string; summary: string; description: string; location: string; dtstart: Date; dtend: Date; dtstamp: Date }[]) {
  const t = getCopy();
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${t.icalendar.prodId}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${t.icalendar.calName}`,
    'X-WR-TIMEZONE:UTC',
  ];

  for (const e of events) {
    const eventLines = [
      'BEGIN:VEVENT',
      `UID:${e.uid}`,
      `DTSTAMP:${fmtIcsDate(e.dtstamp)}`,
      `DTSTART:${fmtIcsDate(e.dtstart)}`,
      `DTEND:${fmtIcsDate(e.dtend)}`,
      `SUMMARY:${escapeIcs(e.summary)}`,
      e.description ? `DESCRIPTION:${escapeIcs(e.description)}` : '',
      e.location ? `LOCATION:${escapeIcs(e.location)}` : '',
      'END:VEVENT',
    ].filter(Boolean);
    lines.push(...eventLines);
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

// GET /api/whistles/ical?token=<calToken>
// Returns ICS feed for the user's claimed whistles (caregiver) or posted whistles (parent).
// Also accepts GET /api/whistles/ical (authenticated via Clerk session) — generates+saves token, redirects to token URL.
export async function GET(req: NextRequest) {
  const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://joincovey.co';
  const token = req.nextUrl.searchParams.get('token');

  let user: typeof users.$inferSelect | undefined;

  if (token) {
    // Token-authenticated path — used by calendar apps
    const [row] = await db.select().from(users).where(eq(users.calToken, token)).limit(1);
    if (!row) return new NextResponse('Unauthorized', { status: 401 });
    user = row;
  } else {
    // Session-authenticated path — used when user copies the URL from Settings
    // Dynamically import Clerk auth to avoid build-time issues
    const { auth } = await import('@clerk/nextjs/server');
    const { userId } = await auth();
    if (!userId) return new NextResponse('Unauthorized', { status: 401 });

    const [row] = await db.select().from(users).where(eq(users.clerkUserId, userId)).limit(1);
    if (!row) return new NextResponse('Unauthorized', { status: 401 });

    // Generate and persist token on first use
    if (!row.calToken) {
      const newToken = crypto.randomBytes(24).toString('hex');
      const [updated] = await db.update(users).set({ calToken: newToken }).where(eq(users.id, row.id)).returning();
      user = updated;
    } else {
      user = row;
    }

    // Redirect to token URL so the user can copy a stable subscribe link
    return NextResponse.redirect(`${APP_URL}/api/whistles/ical?token=${user.calToken}`);
  }

  // Fetch relevant whistles
  let userShifts: typeof whistles.$inferSelect[] = [];

  if (user.role === 'watcher') {
    userShifts = await db.select().from(whistles).where(
      and(eq(whistles.claimedByUserId, user.id), inArray(whistles.status, ['claimed', 'done']))
    );
  } else {
    // Parent sees their posted whistles
    userShifts = await db.select().from(whistles).where(
      and(eq(whistles.createdByUserId, user.id), inArray(whistles.status, ['open', 'claimed', 'done']))
    );
  }

  // Fetch household for location field
  const t = getCopy();
  const [household] = await db.select().from(households).where(eq(households.id, user.householdId)).limit(1);
  const location = household?.name ? `${household.name} (${t.brand.name})` : t.brand.name;

  const now = new Date();
  const events = userShifts.map(s => {
    const parts = [s.forWhom && `For ${s.forWhom}`, s.notes].filter(Boolean);
    return {
      uid: `shift-${s.id}@${t.icalendar.uidDomain}`,
      summary: s.title,
      description: parts.join(' · '),
      location,
      dtstart: s.startsAt,
      dtend: s.endsAt,
      dtstamp: now,
    };
  });

  const ics = buildIcs(events);

  return new NextResponse(ics, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${t.icalendar.filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}

// Q1: rotate the user's calToken — invalidates any existing calendar
// subscription URL and issues a new one. Used when a user thinks their
// feed URL has been shared/leaked. Session-authenticated only; the old
// token URL stops working immediately on next request.
export async function DELETE() {
  try {
    const { auth } = await import('@clerk/nextjs/server');
    const { userId } = await auth();
    if (!userId) return new NextResponse('Unauthorized', { status: 401 });

    const rl = rateLimit({ key: `cal-token-rotate:${userId}`, limit: 5, windowMs: 60 * 60_000 });
    const limited = rateLimitResponse(rl);
    if (limited) return limited;

    const newToken = crypto.randomBytes(24).toString('hex');
    const [updated] = await db.update(users)
      .set({ calToken: newToken })
      .where(eq(users.clerkUserId, userId))
      .returning();
    if (!updated) return new NextResponse('Unauthorized', { status: 401 });

    return NextResponse.json({ ok: true, token: newToken });
  } catch (err) {
    return authError(err, 'ical:rotate', 'Could not rotate calendar URL');
  }
}
