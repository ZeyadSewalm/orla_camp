-- =============================================================
-- OrlaDent Camp — Migration 003: Bunny Stream video hosting
--
-- Run ONCE in the Supabase SQL editor, after migration-002-admin.sql.
-- Additive only. Existing Google Drive links keep working untouched:
-- a module can have EITHER a Drive link OR a Bunny video, and the player
-- picks whichever is set.
-- =============================================================

alter table course_modules add column if not exists bunny_video_id text;
alter table course_modules add column if not exists video_source text default 'drive';
alter table course_modules add column if not exists video_duration_seconds int;

comment on column course_modules.bunny_video_id is 'Bunny Stream GUID. When set and video_source = bunny, playback goes through a signed, expiring URL.';
comment on column course_modules.video_source is 'drive | bunny — which player to render. Defaults to drive so existing modules are unaffected.';

-- Any module that already has a Drive link stays on Drive explicitly.
update course_modules
set video_source = 'drive'
where video_source is null and video_link is not null;
