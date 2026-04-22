CREATE TYPE "public"."app_role" AS ENUM('parent', 'caregiver');--> statement-breakpoint
CREATE TYPE "public"."bell_response" AS ENUM('on_my_way', 'in_thirty', 'cannot');--> statement-breakpoint
CREATE TYPE "public"."bell_status" AS ENUM('ringing', 'handled', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."shift_status" AS ENUM('open', 'claimed', 'cancelled', 'done');--> statement-breakpoint
CREATE TYPE "public"."village_group" AS ENUM('inner', 'family', 'sitter');--> statement-breakpoint
CREATE TABLE "bell_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bell_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"response" "bell_response" NOT NULL,
	"responded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bells" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"note" text,
	"starts_at" timestamp NOT NULL,
	"ends_at" timestamp NOT NULL,
	"status" "bell_status" DEFAULT 'ringing' NOT NULL,
	"handled_by_user_id" uuid,
	"handled_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "caregiver_unavailability" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"starts_at" timestamp NOT NULL,
	"ends_at" timestamp NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "family_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token" text NOT NULL,
	"from_user_id" uuid NOT NULL,
	"parent_email" text NOT NULL,
	"parent_name" text,
	"village_group" "village_group" DEFAULT 'family' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"accepted_household_id" uuid,
	"accepted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "family_invites_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "households" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_org_id" text NOT NULL,
	"name" text NOT NULL,
	"glyph" text DEFAULT '🏡' NOT NULL,
	"accent_color" text,
	"setup_complete_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "households_clerk_org_id_unique" UNIQUE("clerk_org_id")
);
--> statement-breakpoint
CREATE TABLE "kids" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"birthday" date,
	"notes" text,
	"photo_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"household_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shifts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"claimed_by_user_id" uuid,
	"preferred_caregiver_id" uuid,
	"title" text NOT NULL,
	"for_whom" text,
	"notes" text,
	"starts_at" timestamp NOT NULL,
	"ends_at" timestamp NOT NULL,
	"rate_cents" integer,
	"status" "shift_status" DEFAULT 'open' NOT NULL,
	"claimed_at" timestamp,
	"is_recurring" boolean DEFAULT false NOT NULL,
	"recur_day_of_week" integer,
	"recur_ends_at" date,
	"recur_occurrences" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" text NOT NULL,
	"household_id" uuid NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role" "app_role" DEFAULT 'parent' NOT NULL,
	"village_group" "village_group" DEFAULT 'inner' NOT NULL,
	"photo_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_clerk_user_household_unique" UNIQUE("clerk_user_id","household_id")
);
--> statement-breakpoint
ALTER TABLE "bell_responses" ADD CONSTRAINT "bell_responses_bell_id_bells_id_fk" FOREIGN KEY ("bell_id") REFERENCES "public"."bells"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bell_responses" ADD CONSTRAINT "bell_responses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bells" ADD CONSTRAINT "bells_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bells" ADD CONSTRAINT "bells_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bells" ADD CONSTRAINT "bells_handled_by_user_id_users_id_fk" FOREIGN KEY ("handled_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "caregiver_unavailability" ADD CONSTRAINT "caregiver_unavailability_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_invites" ADD CONSTRAINT "family_invites_from_user_id_users_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_invites" ADD CONSTRAINT "family_invites_accepted_household_id_households_id_fk" FOREIGN KEY ("accepted_household_id") REFERENCES "public"."households"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kids" ADD CONSTRAINT "kids_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_claimed_by_user_id_users_id_fk" FOREIGN KEY ("claimed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_preferred_caregiver_id_users_id_fk" FOREIGN KEY ("preferred_caregiver_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;