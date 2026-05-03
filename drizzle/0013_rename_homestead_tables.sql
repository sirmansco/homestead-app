-- Rename all Homestead-era table names to Covey brand names.
-- Safe: Postgres RENAME is metadata-only, no row rewrites.
ALTER TABLE shifts RENAME TO whistles;
ALTER TABLE bells RENAME TO lanterns;
ALTER TABLE bell_responses RENAME TO lantern_responses;
ALTER TABLE caregiver_unavailability RENAME TO unavailability;
ALTER TABLE kids RENAME TO chicks;
