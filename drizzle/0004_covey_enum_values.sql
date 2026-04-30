-- Phase 4: Add covey + field to village_group enum (additive only).
-- No backfill yet — existing rows stay inner_circle/sitter until Phase 6 cutover.
-- ALTER TYPE ADD VALUE cannot run inside a transaction; drizzle-kit breakpoints handle this.
ALTER TYPE "village_group" ADD VALUE IF NOT EXISTS 'covey';
ALTER TYPE "village_group" ADD VALUE IF NOT EXISTS 'field';
