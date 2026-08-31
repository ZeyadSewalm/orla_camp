-- =============================================================
-- OrlaDent Camp — Migration 008: PER-MODULE PACKAGE (TIER) ASSIGNMENT
--
-- Run ONCE in the Supabase SQL editor, after migration-007-column-security.sql.
-- Additive and idempotent — safe to re-run.
-- =============================================================
--
-- WHY THIS EXISTS
--
-- Every course module (lesson) used to be visible to any student with
-- `has_access = true`, regardless of which package (tier) they actually
-- bought — the pricing page promises different content per package
-- ("Foundation" = the foundation modules, "Freelance Ready" = everything
-- through full-arch cases), but nothing in the database enforced that.
--
-- This adds a `tier_ids` column to `course_modules`, mirroring the existing
-- `promo_codes.applicable_tiers` pattern already used elsewhere in this
-- schema: an array of tier ids a module is assigned to. A lesson can now be
-- assigned to one package, several, or all of them, from the admin panel.
--
-- BACKWARD COMPATIBLE ON PURPOSE: a module with `tier_ids` left NULL or
-- empty is treated as visible to every package with access — exactly the
-- current behaviour — so every module that exists today keeps working
-- unchanged until an admin deliberately restricts it to specific packages.

alter table public.course_modules
  add column if not exists tier_ids uuid[];

comment on column public.course_modules.tier_ids is
  'Packages (tiers) this lesson is assigned to. NULL or empty = visible to every package with access (default, backward-compatible). Otherwise the signed-in student''s tiers.tier_id must be one of these ids for the lesson to unlock.';

-- No RLS/column-grant change needed: this column carries no video URL or
-- other secret (those stay protected by migration-007), it is just metadata
-- the server uses to decide which lessons to unlock.
