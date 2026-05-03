ALTER TABLE "family_invites" ADD COLUMN "expires_at" timestamp;--> statement-breakpoint
UPDATE "family_invites" SET "expires_at" = created_at + interval '72 hours' WHERE expires_at IS NULL;
