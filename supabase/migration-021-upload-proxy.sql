-- =============================================================
-- OrlaDent Camp — Migration 021: KEEP THE DRIVE UPLOAD SESSION ON THE SERVER
--
-- Run ONCE. Additive and idempotent.
-- =============================================================
--
-- WHY THIS EXISTS
--
-- STL task uploads failed with "The connection dropped during upload" while
-- the student's connection was fine. The Drive session was created by the Apps
-- Script bridge — server-side, with no Origin — and then the student's BROWSER
-- sent the file bytes to it. Google ties a resumable session to the origin
-- that will upload to it, and a session created without one rejects browser
-- requests at the CORS layer. The browser reports a CORS rejection to page
-- code as a plain network failure, which is why it read as a dropped
-- connection.
--
-- The fix routes each chunk through the site's own server, which forwards it
-- to Drive. Server-to-server there is no CORS at all, so this works with the
-- Apps Script bridge exactly as it is — no redeploy, no Origin header to hope
-- the bridge passes along.
--
-- WHY THE URL IS STORED HERE rather than handed to the browser
--
-- The chunk proxy must know where to send bytes. If the browser supplied that
-- URL, the proxy would forward data to any upload URL a caller names — a free
-- relay for anyone's own Google upload sessions, on this site's bandwidth. Read
-- from this column instead, the destination is always the session this server
-- created for this submission, and nothing the browser sends can change it.

alter table public.assignment_submissions
  add column if not exists upload_session_url text;

comment on column public.assignment_submissions.upload_session_url is
  'Drive resumable session for an in-progress upload. Written by /api/tasks/upload-session, read by /api/tasks/upload-chunk, cleared on completion. Only meaningful while status = ''uploading''.';
