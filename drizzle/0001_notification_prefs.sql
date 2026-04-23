-- Add notification preference columns to users table.
-- Defaults to true (opt-out model) — existing users automatically receive all
-- notification types until they change their preference in Settings.
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "notify_shift_posted"  boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "notify_shift_claimed"  boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "notify_shift_released" boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "notify_bell_ringing"   boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "notify_bell_response"  boolean NOT NULL DEFAULT true;
