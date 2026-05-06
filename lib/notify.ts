import { eq, and, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { whistles, users, households, lanterns } from '@/lib/db/schema';
import { pushToUser, pushToUsers, type PushResult } from '@/lib/push';
import { fmtDateTime, fmtDateShort } from '@/lib/format/time';
import { getCopy } from '@/lib/copy';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://joincovey.co';

if (!RESEND_API_KEY) {
  console.warn('[notify] RESEND_API_KEY not set — email notifications disabled');
}

// L13 + L16: every callsite that surfaces "did the notification land" to the
// client (lantern POST, shift POST) returns this discriminated outcome. Every
// silent-skip path (creator opted out, empty inner circle, Resend missing)
// emits a structured `notify_*_skip` log line via logSkip() before returning,
// so operations can distinguish intentional suppression from broken pipeline.
export type NotifyResult =
  | { kind: 'delivered'; recipients: number; delivered: number }
  | { kind: 'partial'; recipients: number; delivered: number; failed: number; errors: string[] }
  | { kind: 'no_recipients'; reason: 'empty_inner_circle' | 'empty_field' | 'no_caregivers' | 'targeted_caregiver_not_opted_in' }
  | { kind: 'vapid_missing'; recipients: number }
  | { kind: 'push_error'; recipients: number; error: string }
  | { kind: 'auto_escalated_to_field'; lanternId: string };

function logSkip(event: string, payload: Record<string, unknown>) {
  console.log(JSON.stringify({ event, ...payload }));
}

function pushResultToNotify(r: PushResult, recipients: number): NotifyResult {
  if (r.reason === 'vapid_not_configured') return { kind: 'vapid_missing', recipients };
  // Stage 2 review: targeted-caregiver path can return attempted:0 when the
  // user is opted-in but has no push subscription rows. Without this guard
  // the next branch (delivered === attempted && failed === 0) would report
  // "delivered: 0 of 1" as kind:'delivered' — a silent-success regression.
  if (r.attempted === 0) return { kind: 'push_error', recipients, error: 'no_subscriptions' };
  if (r.delivered === r.attempted && r.failed === 0) return { kind: 'delivered', recipients, delivered: r.delivered };
  if (r.delivered > 0) return { kind: 'partial', recipients, delivered: r.delivered, failed: r.failed, errors: r.errors.slice(0, 3) };
  return { kind: 'push_error', recipients, error: r.errors[0] || 'all_subscriptions_failed' };
}

async function send(to: string[], subject: string, text: string) {
  if (!RESEND_API_KEY) {
    logSkip('notify_email_skip', { reason: 'resend_not_configured', recipients: to.length });
    return;
  }
  if (to.length === 0) {
    logSkip('notify_email_skip', { reason: 'empty_recipient_list' });
    return;
  }
  const t = getCopy();
  const from = process.env.NOTIFY_FROM || `${t.brand.name} <${t.emails.notify}>`;
  // Q2: Reply-To routes user replies to the human-monitored contact inbox
  // instead of the noreply notify alias, which silently drops or bounces.
  const replyTo = process.env.NOTIFY_REPLY_TO || t.emails.contact;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({ from, to, subject, text, reply_to: replyTo }),
    });
    if (!res.ok) {
      let body = '';
      try { body = await res.text(); } catch { /* ignore */ }
      console.error(`[notify:email] resend failed: status ${res.status} body ${body}`);
    }
  } catch (err) {
    console.error('[notify:email]', err);
  }
}

export async function notifyNewShift(shiftId: string, preferredCaregiverId?: string): Promise<NotifyResult> {
  const [row] = await db.select({
    shift: whistles,
    household: households,
    creator: users,
  })
    .from(whistles)
    .leftJoin(households, eq(whistles.householdId, households.id))
    .leftJoin(users, eq(whistles.createdByUserId, users.id))
    .where(eq(whistles.id, shiftId))
    .limit(1);
  if (!row?.shift || !row.household) {
    logSkip('notify_new_shift_skip', { reason: 'shift_or_household_missing', shiftId });
    return { kind: 'no_recipients', reason: 'no_caregivers' };
  }

  // If a preferred caregiver is set, only notify that one person
  let recipients;
  if (preferredCaregiverId) {
    recipients = await db.select().from(users).where(eq(users.id, preferredCaregiverId));
  } else {
    // Keepers never receive shift-posted alerts; co-keeper suppression is automatic
    recipients = await db.select().from(users).where(and(
      eq(users.householdId, row.shift.householdId),
      eq(users.role, 'watcher'),
    ));
  }

  // Filter to only those who have notifyShiftPosted enabled
  const opted = recipients.filter(r => r.notifyShiftPosted !== false);
  const emails = opted.map(r => r.email).filter(Boolean);
  const optedIds = opted.map(r => r.id);

  const t = getCopy();
  const when = fmtDateShort(row.shift.startsAt);

  let result: NotifyResult;
  if (preferredCaregiverId) {
    if (!optedIds.includes(preferredCaregiverId)) {
      logSkip('notify_new_shift_skip', { reason: 'targeted_caregiver_not_opted_in', shiftId, preferredCaregiverId });
      result = { kind: 'no_recipients', reason: 'targeted_caregiver_not_opted_in' };
    } else {
      try {
        const r = await pushToUser(preferredCaregiverId, {
          title: t.request.pushTitleTargeted(row.household!.name),
          body: `${row.shift.title} · ${when}`,
          url: `/?tab=${t.request.deepLinkTab}`,
          tag: `${t.request.tagPrefix}-${shiftId}`,
        });
        result = pushResultToNotify(r, 1);
      } catch (err) {
        console.error('[notify:newShift:push:targeted]', err);
        result = { kind: 'push_error', recipients: 1, error: err instanceof Error ? err.message : String(err) };
      }
    }
  } else {
    if (optedIds.length === 0) {
      logSkip('notify_new_shift_skip', { reason: 'no_caregivers_opted_in', shiftId, householdId: row.shift.householdId });
      result = { kind: 'no_recipients', reason: 'no_caregivers' };
    } else {
      try {
        const r = await pushToUsers(optedIds, row.shift.householdId, {
          title: t.request.pushTitle(row.household!.name),
          body: `${row.shift.title} · ${when}`,
          url: `/?tab=${t.request.deepLinkTab}`,
          tag: `${t.request.tagPrefix}-${shiftId}`,
        });
        result = pushResultToNotify(r, optedIds.length);
      } catch (err) {
        console.error('[notify:newShift:push:broadcast]', err);
        result = { kind: 'push_error', recipients: optedIds.length, error: err instanceof Error ? err.message : String(err) };
      }
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

  return result;
}

export async function notifyShiftClaimed(shiftId: string) {
  const [row] = await db.select({
    shift: whistles,
    household: households,
  })
    .from(whistles)
    .leftJoin(households, eq(whistles.householdId, households.id))
    .where(eq(whistles.id, shiftId))
    .limit(1);
  if (!row?.shift || !row.shift.claimedByUserId) {
    logSkip('notify_shift_claimed_skip', { reason: 'shift_or_claim_missing', shiftId });
    return;
  }

  const [creator] = await db.select().from(users).where(eq(users.id, row.shift.createdByUserId)).limit(1);
  const [claimer] = await db.select().from(users).where(eq(users.id, row.shift.claimedByUserId)).limit(1);
  if (!creator) {
    logSkip('notify_shift_claimed_skip', { reason: 'creator_missing', shiftId });
    return;
  }

  // Respect the creator's notifyShiftClaimed preference
  if (creator.notifyShiftClaimed === false) {
    logSkip('notify_shift_claimed_skip', { reason: 'creator_opted_out', shiftId, creatorId: creator.id });
    return;
  }

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

  if (!creator.email) {
    logSkip('notify_shift_claimed_skip', { reason: 'creator_email_missing', shiftId, creatorId: creator.id });
    return;
  }

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

// B8: confirmation push to the watcher who just claimed a shift, separate
// from notifyShiftClaimed (which goes to the keeper who created it). Fires
// regardless of the claimer's notifyShiftClaimed preference — that flag
// gates "someone covered something for me," not "I covered something."
export async function notifyShiftClaimedConfirmation(shiftId: string) {
  const [shift] = await db.select().from(whistles).where(eq(whistles.id, shiftId)).limit(1);
  if (!shift || !shift.claimedByUserId) {
    logSkip('notify_shift_claimed_confirmation_skip', { reason: 'shift_or_claim_missing', shiftId });
    return;
  }

  const t = getCopy();
  const when = fmtDateShort(shift.startsAt);

  try {
    await pushToUser(shift.claimedByUserId, {
      title: t.request.claimerConfirmTitle(shift.title),
      body: t.request.claimerConfirmBody(when),
      url: `/?tab=${t.request.shiftsDeepLinkTab}`,
      tag: `${t.request.claimerConfirmTagPrefix}-${shiftId}`,
    });
  } catch (err) {
    console.error('[notify:shiftClaimedConfirmation:push]', err);
  }
}

export async function notifyShiftReleased(shiftId: string, releasedByUserId: string, reason?: string | null) {
  const [row] = await db.select({
    shift: whistles,
    household: households,
  })
    .from(whistles)
    .leftJoin(households, eq(whistles.householdId, households.id))
    .where(eq(whistles.id, shiftId))
    .limit(1);
  if (!row?.shift) {
    logSkip('notify_shift_released_skip', { reason: 'shift_missing', shiftId });
    return;
  }

  const [creator] = await db.select().from(users).where(eq(users.id, row.shift.createdByUserId)).limit(1);
  const [releaser] = await db.select().from(users).where(eq(users.id, releasedByUserId)).limit(1);
  if (!creator) {
    logSkip('notify_shift_released_skip', { reason: 'creator_missing', shiftId });
    return;
  }

  // Respect the creator's notifyShiftReleased preference
  if (creator.notifyShiftReleased === false) {
    logSkip('notify_shift_released_skip', { reason: 'creator_opted_out', shiftId, creatorId: creator.id });
    return;
  }

  const t = getCopy();
  const releaserName = releaser?.name || `A ${t.roles.watcher.singular.toLowerCase()}`;
  const when = fmtDateShort(row.shift.startsAt);

  const trimmedReason = reason?.trim();
  const body = trimmedReason
    ? `${t.request.releasedBody(row.shift.title, when)} — "${trimmedReason}"`
    : t.request.releasedBody(row.shift.title, when);

  try {
    await pushToUser(row.shift.createdByUserId, {
      title: t.request.releasedTitle(releaserName),
      body,
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
    shift: whistles,
    household: households,
  })
    .from(whistles)
    .leftJoin(households, eq(whistles.householdId, households.id))
    .where(eq(whistles.id, shiftId))
    .limit(1);
  if (!row?.shift) {
    logSkip('notify_shift_cancelled_skip', { reason: 'shift_missing', shiftId });
    return;
  }

  const [recipient] = await db.select().from(users).where(eq(users.id, recipientUserId)).limit(1);
  if (!recipient) {
    logSkip('notify_shift_cancelled_skip', { reason: 'recipient_missing', shiftId, recipientUserId });
    return;
  }
  if (recipient.notifyShiftReleased === false) {
    logSkip('notify_shift_cancelled_skip', { reason: 'recipient_opted_out', shiftId, recipientUserId });
    return;
  }

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

export async function notifyLanternLit(lanternId: string): Promise<NotifyResult> {
  const t = getCopy();
  const [lantern] = await db.select().from(lanterns).where(eq(lanterns.id, lanternId)).limit(1);
  if (!lantern) {
    logSkip('notify_lantern_lit_skip', { reason: 'lantern_missing', lanternId });
    return { kind: 'no_recipients', reason: 'no_caregivers' };
  }

  const [household] = await db.select().from(households).where(eq(households.id, lantern.householdId)).limit(1);
  if (!household) {
    logSkip('notify_lantern_lit_skip', { reason: 'household_missing', lanternId, householdId: lantern.householdId });
    return { kind: 'no_recipients', reason: 'no_caregivers' };
  }

  // Transitional read-compat: include legacy inner_circle rows alongside covey.
  // Remove after B4 backfill confirms zero inner_circle rows in production.
  const innerCircle = await db.select({ id: users.id })
    .from(users)
    .where(and(
      eq(users.householdId, lantern.householdId),
      eq(users.role, 'watcher'),
      inArray(users.villageGroup, ['covey', 'inner_circle']),
      eq(users.notifyLanternLit, true),
    ));
  if (innerCircle.length === 0) {
    // Empty Covey at t=0: don't wait for the 5-min cron. Fan straight to Field
    // via the same atomic-guarded helper the cron uses, so escalatedAt is set
    // and the cron skips this row when it next ticks.
    logSkip('notify_lantern_lit_skip', { reason: 'empty_inner_circle_auto_escalated', lanternId, householdId: lantern.householdId });
    const { escalateLantern } = await import('@/lib/lantern-escalation');
    await escalateLantern(lanternId);
    return { kind: 'auto_escalated_to_field', lanternId };
  }

  try {
    const r = await pushToUsers(innerCircle.map(u => u.id), lantern.householdId, {
      title: t.urgentSignal.pushTitle(household.name),
      body: t.urgentSignal.pushBody(lantern.reason, lantern.note ?? undefined),
      url: `/?tab=${t.urgentSignal.deepLinkTab}`,
      tag: `${t.urgentSignal.tagPrefix}-${lantern.id}`,
    });
    return pushResultToNotify(r, innerCircle.length);
  } catch (err) {
    console.error('[notify:lanternLit:push]', err);
    return { kind: 'push_error', recipients: innerCircle.length, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function notifyLanternEscalated(lanternId: string) {
  const t = getCopy();
  const [lantern] = await db.select().from(lanterns).where(eq(lanterns.id, lanternId)).limit(1);
  if (!lantern) {
    logSkip('notify_lantern_escalated_skip', { reason: 'lantern_missing', lanternId });
    return;
  }

  // Transitional read-compat: include legacy sitter rows alongside field.
  // Remove after B4 backfill confirms zero sitter rows in production.
  const sitters = await db.select({ id: users.id })
    .from(users)
    .where(and(
      eq(users.householdId, lantern.householdId),
      eq(users.role, 'watcher'),
      inArray(users.villageGroup, ['field', 'sitter']),
      eq(users.notifyLanternLit, true),
    ));
  if (sitters.length === 0) {
    logSkip('notify_lantern_escalated_skip', { reason: 'empty_field', lanternId, householdId: lantern.householdId });
    return;
  }

  try {
    await pushToUsers(sitters.map(s => s.id), lantern.householdId, {
      title: t.urgentSignal.escalateTitle(lantern.reason),
      body: t.urgentSignal.escalateBody,
      url: `/?tab=${t.urgentSignal.deepLinkTab}`,
      tag: `${t.urgentSignal.escalateTagPrefix}-${lanternId}`,
    });
  } catch (err) {
    console.error('[notify:lanternEscalated:push]', err);
  }
}

export async function notifyLanternResponse(
  lanternId: string,
  responderId: string,   // users.id (not clerkUserId)
  response: 'on_my_way' | 'in_thirty' | 'cannot',
) {
  // Only push — no email for lantern responses (time-sensitive, email is too slow)
  const [lantern] = await db.select().from(lanterns).where(eq(lanterns.id, lanternId)).limit(1);
  if (!lantern) {
    logSkip('notify_lantern_response_skip', { reason: 'lantern_missing', lanternId });
    return;
  }

  const [responder] = await db.select().from(users).where(eq(users.id, responderId)).limit(1);
  if (!responder) {
    logSkip('notify_lantern_response_skip', { reason: 'responder_missing', lanternId, responderId });
    return;
  }

  const name = responder.name || 'Someone';

  // Find the keepers who own this household; filter by their notifyLanternResponse pref
  const parents = await db.select().from(users).where(
    and(eq(users.householdId, lantern.householdId), eq(users.role, 'keeper'))
  );

  const optedParents = parents.filter(p => p.notifyLanternResponse !== false);
  if (optedParents.length === 0) {
    logSkip('notify_lantern_response_skip', { reason: 'no_parents_opted_in', lanternId, householdId: lantern.householdId });
    return;
  }

  const t = getCopy();
  const msg = response === 'on_my_way'
    ? { title: t.urgentSignal.respondedTitles.onWay(name), body: t.urgentSignal.respondedBodies.onWay, tag: `${t.urgentSignal.respondedTagPrefix}-${lanternId}` }
    : response === 'in_thirty'
    ? { title: t.urgentSignal.respondedTitles.thirty(name), body: t.urgentSignal.respondedBodies.thirty, tag: `${t.urgentSignal.thirtyTagPrefix}-${lanternId}` }
    : { title: t.urgentSignal.respondedTitles.cannot(name), body: t.urgentSignal.respondedBodies.cannot, tag: `${t.urgentSignal.cannotTagPrefix}-${lanternId}` };

  for (const parent of optedParents) {
    try {
      await pushToUser(parent.id, { ...msg, url: `/?tab=${t.urgentSignal.deepLinkTab}` });
    } catch (err) {
      console.error('[notify:lanternResponse:push]', err);
    }
  }
}
