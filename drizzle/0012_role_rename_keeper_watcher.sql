-- Rename app_role enum values: parent → keeper, caregiver → watcher
-- ALTER TYPE ... RENAME VALUE is available in Postgres 10+ and does NOT
-- require a table rewrite — existing rows are updated in-place automatically.

ALTER TYPE "public"."app_role" RENAME VALUE 'parent' TO 'keeper';
ALTER TYPE "public"."app_role" RENAME VALUE 'caregiver' TO 'watcher';
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'keeper';
