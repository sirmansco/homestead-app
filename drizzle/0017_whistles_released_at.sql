-- Adds released_at to whistles. Set when a watcher releases a claimed whistle
-- (status returns to 'open' but the parent should see a "Send back" affordance
-- distinct from a never-claimed open whistle). Cleared when the parent
-- rebroadcasts.
--
-- Hand-written rather than generated via drizzle-kit because of the snapshot
-- drift documented in TODO.md (FK constraint names from 0013 don't match the
-- post-rename schema, so any drizzle-kit generation pulls 35 lines of
-- unintended drops/recreates).
ALTER TABLE "whistles" ADD COLUMN "released_at" timestamp;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_whistles_household_released_at" ON "whistles" ("household_id", "released_at");
