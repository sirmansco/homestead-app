-- Rename bell_id column to lantern_id in lantern_responses.
-- The table was renamed in 0013 but the column was missed.
ALTER TABLE lantern_responses RENAME COLUMN bell_id TO lantern_id;

-- Create missing indexes from 0010_nappy_leader.sql.
-- 0010 was recorded as applied before the table renames (0013) ran,
-- so the index SQL executed against the old table/column names and
-- produced stale index names. The new-name indexes were never created.
-- Using IF NOT EXISTS so this is safe to re-run.
CREATE INDEX IF NOT EXISTS "idx_lantern_responses_lantern_id" ON "lantern_responses" USING btree ("lantern_id");
CREATE INDEX IF NOT EXISTS "idx_lanterns_household_status_ends_at" ON "lanterns" USING btree ("household_id","status","ends_at");
CREATE INDEX IF NOT EXISTS "idx_whistles_household_ends_at_starts_at" ON "whistles" USING btree ("household_id","ends_at","starts_at");
CREATE INDEX IF NOT EXISTS "idx_whistles_household_status_ends_at_starts_at" ON "whistles" USING btree ("household_id","status","ends_at","starts_at");
CREATE INDEX IF NOT EXISTS "idx_whistles_claimed_by_ends_at" ON "whistles" USING btree ("claimed_by_user_id","ends_at");
CREATE INDEX IF NOT EXISTS "idx_whistles_created_by_ends_at" ON "whistles" USING btree ("created_by_user_id","ends_at");
CREATE INDEX IF NOT EXISTS "idx_whistles_preferred_caregiver_status_ends_at" ON "whistles" USING btree ("preferred_caregiver_id","status","ends_at");
