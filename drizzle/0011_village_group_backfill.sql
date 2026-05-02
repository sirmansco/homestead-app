-- B4: backfill legacy village_group enum values to canonical post-migration values.
-- inner_circle → covey, sitter → field.
-- This is a data-only migration; no schema change. The old enum labels remain
-- until a follow-up migration (post zero-row confirmation) removes them.

UPDATE users SET village_group = 'covey' WHERE village_group = 'inner_circle';
UPDATE users SET village_group = 'field' WHERE village_group = 'sitter';
