CREATE INDEX "idx_bell_responses_bell_id" ON "bell_responses" USING btree ("bell_id");--> statement-breakpoint
CREATE INDEX "idx_bells_household_status_ends_at" ON "bells" USING btree ("household_id","status","ends_at");--> statement-breakpoint
CREATE INDEX "idx_shifts_household_ends_at_starts_at" ON "shifts" USING btree ("household_id","ends_at","starts_at");--> statement-breakpoint
CREATE INDEX "idx_shifts_household_status_ends_at_starts_at" ON "shifts" USING btree ("household_id","status","ends_at","starts_at");--> statement-breakpoint
CREATE INDEX "idx_shifts_claimed_by_ends_at" ON "shifts" USING btree ("claimed_by_user_id","ends_at");--> statement-breakpoint
CREATE INDEX "idx_shifts_created_by_ends_at" ON "shifts" USING btree ("created_by_user_id","ends_at");--> statement-breakpoint
CREATE INDEX "idx_shifts_preferred_caregiver_status_ends_at" ON "shifts" USING btree ("preferred_caregiver_id","status","ends_at");--> statement-breakpoint
CREATE INDEX "idx_users_cal_token" ON "users" USING btree ("cal_token") WHERE cal_token IS NOT NULL;