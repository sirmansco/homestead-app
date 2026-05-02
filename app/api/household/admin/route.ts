import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { requireHouseholdAdmin } from '@/lib/auth/household';
import { authError } from '@/lib/api-error';

// PATCH /api/household/admin — body { targetUserId }
// Atomic transfer of isAdmin from caller to target user in the same household.
// Caller must currently be admin; target must be a non-tombstoned member of the
// same household; self-transfer is rejected. The transfer runs in a single
// transaction so the household never has zero or two admins.
export async function PATCH(req: NextRequest) {
  try {
    const { household, user: caller } = await requireHouseholdAdmin();

    const body = await req.json().catch(() => ({})) as { targetUserId?: unknown };
    const targetUserId = typeof body.targetUserId === 'string' ? body.targetUserId.trim() : '';
    if (!targetUserId) {
      return NextResponse.json({ error: 'targetUserId required' }, { status: 400 });
    }

    if (targetUserId === caller.id) {
      return NextResponse.json({ error: 'same_user' }, { status: 400 });
    }

    const result = await db.transaction(async (tx) => {
      // Re-read caller's row inside the transaction. If a concurrent transfer
      // demoted us, this reflects that — and we refuse rather than racing the
      // household into a two-admin state.
      const [callerNow] = await tx.select({ id: users.id, isAdmin: users.isAdmin })
        .from(users)
        .where(and(eq(users.id, caller.id), eq(users.householdId, household.id)))
        .limit(1);

      if (!callerNow || !callerNow.isAdmin) {
        return { kind: 'forbidden' as const };
      }

      const [target] = await tx.select()
        .from(users)
        .where(and(eq(users.id, targetUserId), eq(users.householdId, household.id)))
        .limit(1);

      // Tombstoned rows have name '[deleted]' and clerkUserId 'deleted+<uuid>'
      // (see account DELETE). They are not eligible to receive admin status.
      if (
        !target
        || target.name === '[deleted]'
        || target.clerkUserId.startsWith('deleted+')
      ) {
        return { kind: 'not_found' as const };
      }

      await tx.update(users)
        .set({ isAdmin: false })
        .where(eq(users.id, caller.id));

      const [promoted] = await tx.update(users)
        .set({ isAdmin: true })
        .where(eq(users.id, target.id))
        .returning();

      return { kind: 'ok' as const, newAdmin: promoted };
    });

    if (result.kind === 'forbidden') {
      return NextResponse.json({ error: 'no_access' }, { status: 403 });
    }
    if (result.kind === 'not_found') {
      return NextResponse.json({ error: 'member_not_found' }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      newAdmin: {
        id: result.newAdmin.id,
        name: result.newAdmin.name,
        isAdmin: result.newAdmin.isAdmin,
      },
    });
  } catch (err) {
    return authError(err, 'household:admin', 'Could not transfer admin');
  }
}
