import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { shifts, users, households, bells } from '@/lib/db/schema';
import { pushToUser, pushToUsers } from '@/lib/push';
import { fmtDateTime, fmtDateShort } from '@/lib/format/time';
import { getCopy } from '@/lib/copy';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://joincovey.co';

if (!RESEND_API_KEY) {
  console.warn('[notify] RESEND_API_KEY not set — email notifications disabled');
}

async function send(to: string[], subject: string, text: string) {
  if (!RESEND_API_KEY || to.length === 0) return;
  const t = getCopy();
  const from = process.env.NOTIFY_FROM || `${t.brand.name} <${t.emails.notify}>`;
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({ from, to, subject, text }),
    });
  } catch (err) {
    console.error('[notify:email]', err);
  }
}

export async function notifyNewShift(shiftId: string, preferredCaregiverId?: string): Promise<{ sent: number; eligible: number }> {
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
  if (!row?.shift || !row.household) return { sent: 0, eligible: 0 };

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
  const eligible = opted.length;

  const t = getCopy();
  const when = fmtDateShort(row.shift.startsAt);

  let pushSent = 0;
  if (preferredCaregiverId) {
    if (optedIds.includes(preferredCaregiverId)) {
      try {
        await pushToUser(preferredCaregiverId, {
          title: t.request.pushTitleTargeted(row.household!.name),
          body: `${row.shift.title} · ${when}`,
          url: `/?tab=${t.request.deepLinkTab}`,
          tag: `${t.request.tagPrefix}-${shiftId}`,
        });
        pushSent = 1;
      } catch (err) {
        console.error('[notify:newShift:push:targeted]', err);
      }
    }
  } else {
    try {
      await pushToUsers(optedIds, row.shift.householdId, {
        title: t.request.pushTitle(row.household!.name),
        body: `${row.shift.title} · ${when}`,
        url: `/?tab=${t.request.deepLinkTab}`,
        tag: `${t.request.tagPrefix}-${shiftId}`,
      });
      pushSent = optedIds.length;
    } catch (err) {
      console.error('[notify:newShift:push:broadcast]', err);
    }
  }

  if (emails.length) {
    const subject = `New ${t.request.newLabel.toLowerCase()} posted — ${row.shift.title}`;
    const text = [
      `${row.creator?.name || `A ${t.roles.keeper.singular.toLowerCase()}`} posted a new ${t.request.newLabel.toLowerCase()} for ${row.household.name}:`,
      ``,
      `  ${row.shift.title}`,
      `  ${fmtDateTime(row.shift.startsAt)} – ${fmtDateTime(row.shift.endsAt)}`,
      row.shift.forWhom ? `  For ${row.shift.forWhom}` : '',
      row.shift.notes ? `  ${row.shift.notes}` : '',
      ``,
      `${t.request.acceptVerb} it: ${APP_URL}`,
    ].filter(Boolean).join('\n');
    await send(emails, subject, text);
  }

  return { sent: pushSent, eligible };
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

  const t = getCopy();
  const claimerName = claimer?.name || `A ${t.roles.watcher.singular.toLowerCase()}`;
  const when = fmtDateShort(row.shift.startsAt);

  try {
    await pushToUser(row.shift.createdByUserId, {
      title: t.request.coveredTitle(claimerName),
      body: `"${row.shift.title}" · ${when}`,
      url: `/?tab=${t.request.deepLinkTab}`,
      tag: `${t.request.claimedTagPrefix}-${shiftId}`,
    });
  } catch (err) {
    console.error('[notify:shiftClaimed:push]', err);
  }

  if (!creator.email) return;

  const subject = `${claimerName} ${t.request.acceptVerb.toLowerCase()}ed your ${t.request.newLabel.toLowerCase()}`;
  const text = [
    `${claimerName} just ${t.request.acceptVerb.toLowerCase()}ed your ${t.request.newLabel.toLowerCase()} "${row.shift.title}"`,
    `at ${row.household?.name || 'your household'}:`,
    ``,
    `  ${fmtDateTime(row.shift.startsAt)} – ${fmtDateTime(row.shift.endsAt)}`,
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

  const t = getCopy();
  const releaserName = releaser?.name || `A ${t.roles.watcher.singular.toLowerCase()}`;
  const when = fmtDateShort(row.shift.startsAt);

  try {
    await pushToUser(row.shift.createdByUserId, {
      title: t.request.releasedTitle(releaserName),
      body: t.request.releasedBody(row.shift.title, when),
      url: `/?tab=${t.request.deepLinkTab}`,
      tag: `${t.request.releasedTagPrefix}-${shiftId}`,
    });
  } catch (err) {
    console.error('[notify:shiftReleased:push]', err);
  }
}

export async function notifyShiftCancelled(shiftId: string, recipientUserId: string) {
  // Recipient is the user who had claimed the shift (or the targeted preferred
  // caregiver, when cancellation happens before claim). They've lost a
  // commitment — same mental model as a release, so we reuse notifyShiftReleased
  // as the preference gate.
  const [row] = await db.select({
    shift: shifts,
    household: households,
  })
    .from(shifts)
    .leftJoin(households, eq(shifts.householdId, households.id))
    .where(eq(shifts.id, shiftId))
    .limit(1);
  if (!row?.shift) return;

  const [recipient] = await db.select().from(users).where(eq(users.id, recipientUserId)).limit(1);
  if (!recipient) return;
  if (recipient.notifyShiftReleased === false) return;

  const t = getCopy();
  const when = fmtDateShort(row.shift.startsAt);

  try {
    await pushToUser(recipientUserId, {
      title: t.request.cancelledTitle,
      body: `"${row.shift.title}" · ${when}`,
      url: `/?tab=${t.request.shiftsDeepLinkTab}`,
      tag: `${t.request.cancelTagPrefix}-${shiftId}`,
    });
  } catch (err) {
    console.error('[notify:shiftCancelled:push]', err);
  }

  if (!recipient.email) return;

  const subject = `${t.request.newLabel} cancelled — ${row.shift.title}`;
  const text = [
    `Your ${t.request.newLabel.toLowerCase()} was cancelled at ${row.household?.name || 'your household'}:`,
    ``,
    `  ${row.shift.title}`,
    `  ${fmtDateTime(row.shift.startsAt)} – ${fmtDateTime(row.shift.endsAt)}`,
    ``,
    `View other open ${t.request.tabLabel.toLowerCase()}: ${APP_URL}`,
  ].join('\n');

  await send([recipient.email], subject, text);
}

export async function notifyBellRing(bellId: string): Promise<{ sent: number; eligible: number }> {
  const t = getCopy();
  const [bell] = await db.select().from(bells).where(eq(bells.id, bellId)).limit(1);
  if (!bell) return { sent: 0, eligible: 0 };

  const [household] = await db.select().from(households).where(eq(households.id, bell.householdId)).limit(1);
  if (!household) return { sent: 0, eligible: 0 };

  const innerCircle = await db.select({ id: users.id })
    .from(users)
    .where(and(
      eq(users.householdId, bell.householdId),
      eq(users.role, 'caregiver'),
      eq(users.villageGroup, 'covey'),
      eq(users.notifyBellRinging, true),
    ));
  if (innerCircle.length === 0) return { sent: 0, eligible: 0 };

  try {
    await pushToUsers(innerCircle.map(u => u.id), bell.householdId, {
      title: t.urgentSignal.pushTitle(household.name),
      body: t.urgentSignal.pushBody(bell.reason, bell.note ?? undefined),
      url: `/?tab=${t.urgentSignal.deepLinkTab}`,
      tag: `${t.urgentSignal.tagPrefix}-${bell.id}`,
    });
    return { sent: innerCircle.length, eligible: innerCircle.length };
  } catch (err) {
    console.error('[notify:bellRing:push]', err);
    return { sent: 0, eligible: innerCircle.length };
  }
}

export async function notifyBellEscalated(bellId: string) {
  const t = getCopy();
  const [bell] = await db.select().from(bells).where(eq(bells.id, bellId)).limit(1);
  if (!bell) return;

  const sitters = await db.select({ id: users.id })
    .from(users)
    .where(and(
      eq(users.householdId, bell.householdId),
      eq(users.role, 'caregiver'),
      eq(users.villageGroup, 'field'),
      eq(users.notifyBellRinging, true),
    ));
  if (sitters.length === 0) return;

  try {
    await pushToUsers(sitters.map(s => s.id), bell.householdId, {
      title: t.urgentSignal.escalateTitle(bell.reason),
      body: t.urgentSignal.escalateBody,
      url: `/?tab=${t.urgentSignal.deepLinkTab}`,
      tag: `${t.urgentSignal.escalateTagPrefix}-${bellId}`,
    });
  } catch (err) {
    console.error('[notify:bellEscalated:push]', err);
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

  const t = getCopy();
  const msg = response === 'on_my_way'
    ? { title: t.urgentSignal.respondedTitles.onWay(name), body: t.urgentSignal.respondedBodies.onWay, tag: `${t.urgentSignal.respondedTagPrefix}-${bellId}` }
    : response === 'in_thirty'
    ? { title: t.urgentSignal.respondedTitles.thirty(name), body: t.urgentSignal.respondedBodies.thirty, tag: `${t.urgentSignal.thirtyTagPrefix}-${bellId}` }
    : { title: t.urgentSignal.respondedTitles.cannot(name), body: t.urgentSignal.respondedBodies.cannot, tag: `${t.urgentSignal.cannotTagPrefix}-${bellId}` };

  for (const parent of optedParents) {
    try {
      await pushToUser(parent.id, { ...msg, url: `/?tab=${t.urgentSignal.deepLinkTab}` });
    } catch (err) {
      console.error('[notify:bellResponse:push]', err);
    }
  }
}
