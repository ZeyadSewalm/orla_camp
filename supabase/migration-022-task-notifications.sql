-- =============================================================
-- OrlaDent Camp — Migration 022: NOTIFY REVIEWERS ABOUT STL TASKS TOO
--
-- Run ONCE, after 017. Idempotent.
-- =============================================================
--
-- WHY THIS EXISTS
--
-- Migration 017 notifies admins and reviewers when a CASE REVIEW file arrives
-- (case_file_submissions). STL task uploads live in a different table,
-- assignment_submissions, which had no trigger at all — so a student could
-- finish an STL upload, see "submitted", and no reviewer would ever be told.
--
-- WHY ON UPDATE, NOT INSERT
--
-- An STL submission is INSERTED the moment an upload STARTS, as 'uploading',
-- before a single byte reaches Drive. Most failed attempts never get past
-- that. Notifying on insert would page every reviewer for uploads that never
-- arrived. The row only becomes real work when /api/tasks/complete-upload
-- verifies the file in Drive and flips it to 'submitted' or 'resubmitted' —
-- that transition is what this fires on.

create or replace function public.notify_task_submission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only the moment of arrival, not every later edit to the same row
  -- (grading also UPDATEs it, and must not re-notify).
  if new.status in ('submitted', 'resubmitted')
     and old.status is distinct from new.status then
    insert into public.notifications (recipient_id, type, title, body, href, entity_id)
    select
      p.id,
      'task_submitted',
      case when new.status = 'resubmitted' then 'STL task resubmitted' else 'New STL task submitted' end,
      coalesce(new.original_filename, 'An STL file is ready for review.'),
      '/admin?tab=tasks&submission=' || new.id::text,
      new.id
    from public.profiles p
    where p.role in ('admin', 'reviewer')
      and p.id <> new.user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists task_submission_notification on public.assignment_submissions;
create trigger task_submission_notification
  after update of status on public.assignment_submissions
  for each row execute function public.notify_task_submission();
