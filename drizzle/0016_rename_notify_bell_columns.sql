-- Rename notify_bell_ringing → notify_lantern_lit
-- Rename notify_bell_response → notify_lantern_response
-- Data is preserved; only column names change.
ALTER TABLE "users" RENAME COLUMN "notify_bell_ringing" TO "notify_lantern_lit";
ALTER TABLE "users" RENAME COLUMN "notify_bell_response" TO "notify_lantern_response";
