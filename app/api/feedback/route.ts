import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { feedback } from '@/lib/db/schema';
import { requireHousehold } from '@/lib/auth/household';
import { authError } from '@/lib/api-error';

const VALID_KINDS = ['bug', 'idea', 'general'] as const;
type FeedbackKind = typeof VALID_KINDS[number];

export async function POST(req: NextRequest) {
  try {
    const { household, user } = await requireHousehold();

    const body = await req.json() as { message?: string; kind?: string };
    const message = body.message?.trim();
    if (!message) {
      return NextResponse.json({ error: 'message required' }, { status: 400 });
    }
    if (!body.kind || !VALID_KINDS.includes(body.kind as FeedbackKind)) {
      return NextResponse.json({ error: 'kind must be bug | idea | general' }, { status: 400 });
    }

    await db.insert(feedback).values({
      userId: user.id,
      householdId: household.id,
      message,
      kind: body.kind as FeedbackKind,
      userAgent: req.headers.get('user-agent') ?? undefined,
      appVersion: process.env.NEXT_PUBLIC_APP_SHA ?? undefined,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return authError(err, 'feedback', 'Could not submit feedback');
  }
}
