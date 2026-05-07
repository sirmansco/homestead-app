-- Circle / invite / role audit (2026-05-06).
--
-- Adds two columns to family_invites that the audit needs to make role +
-- household routing decisions explicit and testable, instead of inferred from
-- omitted-payload defaults.
--
-- 1. app_role (nullable) — the role the invitee should land with. Was never
--    persisted; ScreenCircle.tsx omitted role from the caregiverMode payload,
--    requireHousehold() then defaulted new users to 'watcher'. This was
--    Bug #1's root cause.
--
-- 2. household_mode (NOT NULL DEFAULT 'join_existing') — branch on accept:
--    join_existing = today's behavior (invitee joins inviter's household)
--    create_new    = brand-new household with invitee as keeper+isAdmin (the
--                    "watcher introduces a new family" path; Bug #3).
--
-- Hand-written SQL per project memory: drizzle-kit generate pulls in 35 lines
-- of unintended FK constraint drops from 0013 snapshot drift. See TODO.md
-- "Drizzle snapshot drift (chore)".
--
-- Backfill: existing pending invites get household_mode='join_existing' via
-- the column default — this matches their original semantic. If any pending
-- watcher-initiated invites exist at deploy time, they'll route to
-- join_existing (incorrect). Pre-deploy verification query in the audit plan
-- (docs/plans/circle-invite-role-audit.md, Fragile Areas).

CREATE TYPE "household_mode" AS ENUM ('join_existing', 'create_new');--> statement-breakpoint
ALTER TABLE "family_invites" ADD COLUMN "app_role" "app_role";--> statement-breakpoint
ALTER TABLE "family_invites" ADD COLUMN "household_mode" "household_mode" NOT NULL DEFAULT 'join_existing';
