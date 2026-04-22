import { eq, and, inArray, ne } from 'drizzle-orm';
import { db } from '@/lib/db';
import { shifts, users, households } from '@/lib/db/schema';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM = process.env.NOTIFY_FROM || 'Homestead <notify@homestead.app>';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://homestead-app-six.vercel.app';

async function send(to: string[], subject: string, text: string) {
  if (!RESEND_API_KEY || to.length === 0) return;
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({ from: FROM, to, subject, text }),
    });
  } catch {
    // swallow — best effort
  }
}

function fmt(iso: Date) {
  return iso.toLocaleString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

export async function notifyNewShift(shiftId: string, preferredCaregiverId?: string) {
  const [row] = await db.select({
    shift: shifts,
    household: households,
    creator: users,
  })
    .from(shifts)
    .leftJoin(households, eq(shifts.householdId, households.id))
    .leftJoin(users, eq(shifts.createdByUserId, users.id))
    .where(eq(shifts.id, shiftId))
    .limit(1);
  if (!row?.shift || !row.household) return;

  // If a preferred caregiver is set, only notify that one person
  let recipients;
  if (preferredCaregiverId) {
    recipients = await db.select().from(users).where(eq(users.id, preferredCaregiverId));
  } else {
    recipients = await db.select().from(users).where(and(
      eq(users.householdId, row.shift.householdId),
      ne(users.id, row.shift.createdByUserId),
    ));
  }
  const emails = recipients.map(r => r.email).filter(Boolean);

  const when = row.shift.startsAt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

  // Push notification — targeted or broadcast
  import('@/lib/push').then(({ pushToUser, pushToHousehold }) => {
    if (preferredCaregiverId) {
      return pushToUser(preferredCaregiverId, {
        title: `📋 ${row.household!.name} needs you`,
        body: `${row.shift.title} · ${when}`,
        url: '/',
        tag: `shift-${shiftId}`,
      });
    }
    return pushToHousehold(row.household!.id, row.shift.createdByUserId, {
      title: `📋 New shift — ${row.household!.name}`,
      body: `${row.shift.title} · ${when}`,
      url: '/',
      tag: `shift-${shiftId}`,
    });
  }).catch(() => {});

  if (!emails.length) return;

  const subject = `New shift posted — ${row.shift.title}`;
  const text = [
    `${row.creator?.name || 'A parent'} posted a new shift for ${row.household.name}:`,
    ``,
    `  ${row.shift.title}`,
    `  ${fmt(row.shift.startsAt)} – ${fmt(row.shift.endsAt)}`,
    row.shift.forWhom ? `  For ${row.shift.forWhom}` : '',
    row.shift.notes ? `  ${row.shift.notes}` : '',
    ``,
    `Claim it: ${APP_URL}`,
  ].filter(Boolean).join('\n');

  await send(emails, subject, text);
}

export async function notifyShiftClaimed(shiftId: string) {
  const [row] = await db.select({
    shift: shifts,
    household: households,
  })
    .from(shifts)
    .leftJoin(households, eq(shifts.householdId, households.id))
    .where(eq(shifts.id, shiftId))
    .limit(1);
  if (!row?.shift || !row.shift.claimedByUserId) return;

  const [creator] = await db.select().from(users).where(eq(users.id, row.shift.createdByUserId)).limit(1);
  const [claimer] = await db.select().from(users).where(eq(users.id, row.shift.claimedByUserId)).limit(1);
  if (!creator?.email) return;

  const subject = `${claimer?.name || 'Someone'} claimed your shift`;
  const text = [
    `${claimer?.name || 'A caregiver'} just claimed your shift "${row.shift.title}"`,
    `at ${row.household?.name || 'your household'}:`,
    ``,
    `  ${fmt(row.shift.startsAt)} – ${fmt(row.shift.endsAt)}`,
    ``,
    `View it: ${APP_URL}`,
  ].join('\n');

  await send([creator.email], subject, text);
}
