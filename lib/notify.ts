import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { shifts, users, households, bells } from '@/lib/db/schema';
import { pushToUser, pushToUsers } from '@/lib/push';

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
  } catch (err) {
    console.error('[notify:email]', err);
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
    // Parents never receive shift-posted alerts; co-parent suppression is automatic
    recipients = await db.select().from(users).where(and(
      eq(users.householdId, row.shift.householdId),
      eq(users.role, 'caregiver'),
    ));
  }

  // Filter to only those who have notifyShiftPosted enabled
  const opted = recipients.filter(r => r.notifyShiftPosted !== false);
  const emails = opted.map(r => r.email).filter(Boolean);
  const optedIds = opted.map(r => r.id);

  const when = row.shift.startsAt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

  if (preferredCaregiverId) {
    if (optedIds.includes(preferredCaregiverId)) {
      try {
        await pushToUser(preferredCaregiverId, {
          title: `📋 ${row.household!.name} needs you`,
          body: `${row.shift.title} · ${when}`,
          url: '/?tab=almanac',
          tag: `shift-${shiftId}`,
        });
      } catch (err) {
        console.error('[notify:newShift:push:targeted]', err);
      }
    }
  } else {
    try {
      await pushToUsers(optedIds, row.shift.householdId, {
        title: `📋 New shift — ${row.household!.name}`,
        body: `${row.shift.title} · ${when}`,
        url: '/?tab=almanac',
        tag: `shift-${shiftId}`,
      });
    } catch (err) {
      console.error('[notify:newShift:push:broadcast]', err);
    }
  }

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
  if (!creator) return;

  // Respect the creator's notifyShiftClaimed preference
  if (creator.notifyShiftClaimed === false) return;

  const claimerName = claimer?.name || 'A caregiver';
  const when = row.shift.startsAt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

  try {
    await pushToUser(row.shift.createdByUserId, {
      title: `✅ ${claimerName} is on it`,
      body: `"${row.shift.title}" · ${when}`,
      url: '/?tab=almanac',
      tag: `claimed-${shiftId}`,
    });
  } catch (err) {
    console.error('[notify:shiftClaimed:push]', err);
  }

  if (!creator.email) return;

  const subject = `${claimerName} claimed your shift`;
  const text = [
    `${claimerName} just claimed your shift "${row.shift.title}"`,
    `at ${row.household?.name || 'your household'}:`,
    ``,
    `  ${fmt(row.shift.startsAt)} – ${fmt(row.shift.endsAt)}`,
    ``,
    `View it: ${APP_URL}`,
  ].join('\n');

  await send([creator.email], subject, text);
}

export async function notifyShiftReleased(shiftId: string, releasedByUserId: string) {
  const [row] = await db.select({
    shift: shifts,
    household: households,
  })
    .from(shifts)
    .leftJoin(households, eq(shifts.householdId, households.id))
    .where(eq(shifts.id, shiftId))
    .limit(1);
  if (!row?.shift) return;

  const [creator] = await db.select().from(users).where(eq(users.id, row.shift.createdByUserId)).limit(1);
  const [releaser] = await db.select().from(users).where(eq(users.id, releasedByUserId)).limit(1);
  if (!creator) return;

  // Respect the creator's notifyShiftReleased preference
  if (creator.notifyShiftReleased === false) return;

  const releaserName = releaser?.name || 'A caregiver';
  const when = row.shift.startsAt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

  try {
    await pushToUser(row.shift.createdByUserId, {
      title: `↩️ ${releaserName} released your shift`,
      body: `"${row.shift.title}" · ${when} — now open again`,
      url: '/?tab=almanac',
      tag: `released-${shiftId}`,
    });
  } catch (err) {
    console.error('[notify:shiftReleased:push]', err);
  }
}

export async function notifyBellResponse(
  bellId: string,
  responderId: string,   // users.id (not clerkUserId)
  response: 'on_my_way' | 'in_thirty' | 'cannot',
) {
  // Only push — no email for bell responses (time-sensitive, email is too slow)
  const [bell] = await db.select().from(bells).where(eq(bells.id, bellId)).limit(1);
  if (!bell) return;

  const [responder] = await db.select().from(users).where(eq(users.id, responderId)).limit(1);
  if (!responder) return;

  const name = responder.name || 'Someone';

  // Find the parents who own this household; filter by their notifyBellResponse pref
  const parents = await db.select().from(users).where(
    and(eq(users.householdId, bell.householdId), eq(users.role, 'parent'))
  );

  const optedParents = parents.filter(p => p.notifyBellResponse !== false);
  if (optedParents.length === 0) return;

  const msg = response === 'on_my_way'
    ? { title: `✅ ${name} is on the way`, body: 'Bell handled — someone is coming.', tag: `bell-handled-${bellId}` }
    : response === 'in_thirty'
    ? { title: `⏱ ${name} can help in 30 min`, body: 'Still looking for someone sooner…', tag: `bell-thirty-${bellId}` }
    : { title: `${name} can't make it`, body: 'Bell continuing to next circle…', tag: `bell-cannot-${bellId}` };

  for (const parent of optedParents) {
    try {
      await pushToUser(parent.id, { ...msg, url: '/?tab=bell' });
    } catch (err) {
      console.error('[notify:bellResponse:push]', err);
    }
  }
}
