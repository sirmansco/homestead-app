/**
 * cleanup-orphan-clerk-orgs — find Clerk organizations with no matching
 * households row and no live family_invites linkage, so we can review and
 * delete them by hand.
 *
 * Failure mode this catches: in app/api/circle/invite-family/accept/route.ts
 * the create_new branch calls Clerk createOrganization, then updates the
 * invite row in the DB. If the DB write fails between those two steps
 * (network drop, Neon timeout) the org is created but nothing in our DB
 * points to it. The accept route's idempotency guard reuses such orgs on
 * retry, but orgs stranded before that guard landed — or in cases where the
 * user never retries — are invisible until something like this script lists
 * them.
 *
 * Default mode is dry-run: prints orphans and exits. Pass --delete to
 * actually delete them via Clerk. --delete requires --confirm to also be
 * present, to keep accidents two keystrokes away.
 *
 * Heuristic for "orphan":
 *   1. Clerk org exists.
 *   2. No households row has clerk_org_id = org.id.
 *   3. No family_invites row has accepted_household_id pointing to an org-
 *      derived household (covered by check 2 transitively, but logged for
 *      clarity).
 *   4. publicMetadata.inviteId, if present, points to an invite that is
 *      either still 'pending' (the DB update never landed) or has no
 *      acceptedHouseholdId (same failure with a different timing).
 *
 * Run:
 *   npx tsx scripts/cleanup-orphan-clerk-orgs.ts            # dry run
 *   npx tsx scripts/cleanup-orphan-clerk-orgs.ts --delete --confirm
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClerkClient } from '@clerk/backend';
import postgres from 'postgres';

const args = new Set(process.argv.slice(2));
const DELETE = args.has('--delete');
const CONFIRM = args.has('--confirm');

if (DELETE && !CONFIRM) {
  console.error('--delete requires --confirm. Re-run with both flags.');
  process.exit(2);
}

const clerkSecret = process.env.CLERK_SECRET_KEY;
const dbUrl = process.env.DATABASE_URL;
if (!clerkSecret) { console.error('CLERK_SECRET_KEY missing'); process.exit(2); }
if (!dbUrl) { console.error('DATABASE_URL missing'); process.exit(2); }

const clerk = createClerkClient({ secretKey: clerkSecret });
const sql = postgres(dbUrl, { prepare: false });

type Orphan = {
  orgId: string;
  orgName: string;
  createdAt: number;
  inviteIdMeta: string | null;
  reason: string;
};

async function listAllOrgs() {
  const out: Array<{
    id: string;
    name: string;
    createdAt: number;
    publicMetadata: Record<string, unknown>;
  }> = [];
  let offset = 0;
  const limit = 100;
  for (;;) {
    const page = await clerk.organizations.getOrganizationList({ limit, offset });
    for (const o of page.data) {
      out.push({
        id: o.id,
        name: o.name,
        createdAt: o.createdAt,
        publicMetadata: (o.publicMetadata ?? {}) as Record<string, unknown>,
      });
    }
    if (page.data.length < limit) break;
    offset += limit;
  }
  return out;
}

async function main() {
  const orgs = await listAllOrgs();
  if (orgs.length === 0) {
    console.log('No Clerk organizations found.');
    await sql.end();
    return;
  }

  const orgIds = orgs.map(o => o.id);
  const linkedRows = await sql<{ clerk_org_id: string }[]>`
    select clerk_org_id from households where clerk_org_id = any(${orgIds as unknown as string[]})
  `;
  const linked = new Set(linkedRows.map(r => r.clerk_org_id));

  const orphans: Orphan[] = [];
  for (const org of orgs) {
    if (linked.has(org.id)) continue;
    const inviteIdMeta = typeof org.publicMetadata.inviteId === 'string'
      ? (org.publicMetadata.inviteId as string)
      : null;

    let reason = 'no households row points at this org';
    if (inviteIdMeta) {
      const inviteRows = await sql<{ status: string; accepted_household_id: string | null }[]>`
        select status, accepted_household_id from family_invites where id = ${inviteIdMeta}
      `;
      if (inviteRows.length === 0) {
        reason += '; inviteId metadata refers to missing invite';
      } else {
        const inv = inviteRows[0];
        if (inv.status === 'pending') {
          reason += `; invite ${inviteIdMeta} still pending (DB update never landed)`;
        } else if (!inv.accepted_household_id) {
          reason += `; invite ${inviteIdMeta} accepted but acceptedHouseholdId is null`;
        } else {
          reason += `; invite ${inviteIdMeta} points to a different household`;
        }
      }
    }
    orphans.push({
      orgId: org.id,
      orgName: org.name,
      createdAt: org.createdAt,
      inviteIdMeta,
      reason,
    });
  }

  if (orphans.length === 0) {
    console.log(`Scanned ${orgs.length} Clerk org(s). No orphans.`);
    await sql.end();
    return;
  }

  console.log(`Scanned ${orgs.length} Clerk org(s). Found ${orphans.length} orphan(s):\n`);
  for (const o of orphans) {
    const created = new Date(o.createdAt).toISOString();
    console.log(`  ${o.orgId}  "${o.orgName}"  created=${created}`);
    console.log(`    inviteId(meta)=${o.inviteIdMeta ?? '—'}`);
    console.log(`    reason: ${o.reason}`);
  }

  if (!DELETE) {
    console.log('\nDry run. Re-run with --delete --confirm to delete the orgs above.');
    await sql.end();
    return;
  }

  console.log('\nDeleting orphan organizations...');
  let ok = 0;
  let fail = 0;
  for (const o of orphans) {
    try {
      await clerk.organizations.deleteOrganization(o.orgId);
      console.log(`  deleted ${o.orgId}`);
      ok++;
    } catch (err) {
      console.error(`  FAILED ${o.orgId}:`, err);
      fail++;
    }
  }
  console.log(`\nDone. deleted=${ok} failed=${fail}`);
  await sql.end();
  if (fail > 0) process.exit(1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
