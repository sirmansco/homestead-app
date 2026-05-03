CREATE INDEX "idx_lantern_responses_lantern_id" ON "lantern_responses" USING btree ("lantern_id");--> statement-breakpoint
CREATE INDEX "idx_lanterns_household_status_ends_at" ON "lanterns" USING btree ("household_id","status","ends_at");--> statement-breakpoint
CREATE INDEX "idx_whistles_household_ends_at_starts_at" ON "whistles" USING btree ("household_id","ends_at","starts_at");--> statement-breakpoint
CREATE INDEX "idx_whistles_household_status_ends_at_starts_at" ON "whistles" USING btree ("household_id","status","ends_at","starts_at");--> statement-breakpoint
CREATE INDEX "idx_whistles_claimed_by_ends_at" ON "whistles" USING btree ("claimed_by_user_id","ends_at");--> statement-breakpoint
CREATE INDEX "idx_whistles_created_by_ends_at" ON "whistles" USING btree ("created_by_user_id","ends_at");--> statement-breakpoint
CREATE INDEX "idx_whistles_preferred_caregiver_status_ends_at" ON "whistles" USING btree ("preferred_caregiver_id","status","ends_at");--> statement-breakpoint
CREATE INDEX "idx_users_cal_token" ON "users" USING btree ("cal_token") WHERE cal_token IS NOT NULL;
