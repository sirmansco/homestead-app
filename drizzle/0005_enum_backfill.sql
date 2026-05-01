-- Phase 4: Backfill village_group values to Covey naming.
-- inner_circle → covey (Covey tier: notified first, no ask required)
-- sitter       → field (Field tier: paid, available on demand)
-- Old enum values are NOT dropped — Clerk publicMetadata for existing invites
-- still stores the old strings; dropping breaks user auto-create on sign-in.
-- Enum value removal is a Phase 5 post-launch cleanup.
UPDATE "users" SET "village_group" = 'covey' WHERE "village_group" = 'inner_circle';
UPDATE "users" SET "village_group" = 'field'  WHERE "village_group" = 'sitter';
UPDATE "family_invites" SET "village_group" = 'covey' WHERE "village_group" = 'inner_circle';
UPDATE "family_invites" SET "village_group" = 'field'  WHERE "village_group" = 'sitter';
