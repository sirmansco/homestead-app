-- Rename bell_id column to lantern_id in lantern_responses.
-- The table was renamed in 0013 but the column was missed.
ALTER TABLE lantern_responses RENAME COLUMN bell_id TO lantern_id;
