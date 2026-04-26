-- =============================================================
-- Migration: 0002_v1_schema
-- Purpose: Four v1.0 schema changes required by spec §"Schema migrations required for v1.0"
--   1. villageGroupEnum: inner | family | sitter  →  inner_circle | sitter
--      (data-migrates family → inner_circle, inner → inner_circle)
--   2. users.is_admin boolean (default false; backfill: earliest per household = true)
--   3. bells.escalated_at nullable timestamp
--   4. feedback table (new)
--
-- ROLLBACK STEPS (no auto-down; manual only):
--   1. DROP TABLE feedback;
--   2. ALTER TABLE bells DROP COLUMN escalated_at;
--   3. ALTER TABLE users DROP COLUMN is_admin;
--   4. Restore original enum values:
--      a. CREATE TYPE village_group_old AS ENUM ('inner', 'family', 'sitter');
--      b. ALTER TABLE users ALTER COLUMN village_group TYPE village_group_old
--           USING village_group::text::village_group_old;  -- NOTE: rows that were 'family' are now 'inner_circle'; original 'family'/'inner' distinction is LOST
--      c. ALTER TABLE family_invites ALTER COLUMN village_group TYPE village_group_old
--           USING village_group::text::village_group_old;
--      d. DROP TYPE village_group; ALTER TYPE village_group_old RENAME TO village_group;
--      (The family→inner_circle data migration is intentionally irreversible.)
-- =============================================================

-- ---------------------------------------------------------------
-- Part 1: villageGroupEnum reduction
-- Postgres cannot drop individual enum values; the safe idiom is:
--   ADD new value → data-migrate → CREATE new type → ALTER COLUMNs → DROP old → RENAME
-- ---------------------------------------------------------------

-- 1a. Add 'inner_circle' to the existing enum so it can be written immediately
ALTER TYPE village_group ADD VALUE IF NOT EXISTS 'inner_circle';--> statement-breakpoint

-- 1b. Data migration: remap 'inner' and 'family' rows → 'inner_circle'
--     MUST run before the type swap so no rows reference dropped values at ALTER COLUMN time
UPDATE users          SET village_group = 'inner_circle' WHERE village_group IN ('inner', 'family');--> statement-breakpoint
UPDATE family_invites SET village_group = 'inner_circle' WHERE village_group IN ('inner', 'family');--> statement-breakpoint

-- 1c. Create the replacement two-value enum
CREATE TYPE village_group_new AS ENUM ('inner_circle', 'sitter');--> statement-breakpoint

-- 1d. Swap column types (USING cast is safe because no rows hold 'inner' or 'family' after 1b)
ALTER TABLE users           ALTER COLUMN village_group TYPE village_group_new
  USING village_group::text::village_group_new;--> statement-breakpoint
ALTER TABLE family_invites  ALTER COLUMN village_group TYPE village_group_new
  USING village_group::text::village_group_new;--> statement-breakpoint

-- 1e. Drop old enum and rename new one into place
DROP TYPE village_group;--> statement-breakpoint
ALTER TYPE village_group_new RENAME TO village_group;--> statement-breakpoint

-- 1f. Reset column defaults (defaults referencing the old enum type were dropped with it)
ALTER TABLE users          ALTER COLUMN village_group SET DEFAULT 'inner_circle';--> statement-breakpoint
ALTER TABLE family_invites ALTER COLUMN village_group SET DEFAULT 'inner_circle';--> statement-breakpoint

-- ---------------------------------------------------------------
-- Part 2: users.is_admin
-- ---------------------------------------------------------------

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;--> statement-breakpoint

-- Backfill: earliest-created user per household = admin.
-- DISTINCT ON (household_id) ORDER BY created_at ASC, id ASC is deterministic even when
-- two users share an identical created_at timestamp (UUID tiebreak is always unique).
UPDATE users u
SET is_admin = true
FROM (
  SELECT DISTINCT ON (household_id) id
  FROM users
  ORDER BY household_id, created_at ASC, id ASC
) first_per_household
WHERE u.id = first_per_household.id;--> statement-breakpoint

-- ---------------------------------------------------------------
-- Part 3: bells.escalated_at
-- ---------------------------------------------------------------

ALTER TABLE bells ADD COLUMN IF NOT EXISTS escalated_at timestamp;--> statement-breakpoint

-- ---------------------------------------------------------------
-- Part 4: feedback table
-- ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS feedback (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  message      text NOT NULL,
  kind         text NOT NULL CHECK (kind IN ('bug', 'idea', 'general')),
  user_agent   text,
  app_version  text,
  created_at   timestamp NOT NULL DEFAULT now()
);
