-- =============================================================
-- OrlaDent Camp — Migration 023: PHONE AT SIGNUP, ANY FILE TYPE ON TASKS
--
-- Run ONCE. Idempotent.
-- =============================================================

-- ---------- 1. PHONE FROM SIGNUP INTO THE PROFILE ----------
--
-- The signup form now asks for a mobile number and sends it as account
-- metadata. This copies it onto the profile row, the same way full_name and
-- region already were — the WhatsApp automation reads profiles.phone and had
-- nothing to read for most students.
--
-- Stored NORMALISED (E.164 without the plus: 201012345678), by the same rules
-- as lib/phone.ts. A number that is not a valid Egyptian mobile is stored as
-- NULL rather than kept raw: a malformed number would only fail later, silently,
-- in the middle of an automation run. NULL is caught instead — the student is
-- asked for their number on their next visit.

create or replace function public.normalise_egyptian_mobile(value text)
returns text
language sql
immutable
as $$
  select case
    when national ~ '^1[0125][0-9]{8}$' then '20' || national
    else null
  end
  from (
    select regexp_replace(regexp_replace(regexp_replace(
             regexp_replace(coalesce(value, ''), '\D', '', 'g'),
           '^00', ''), '^20', ''), '^0', '') as national
  ) n;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, region, phone)
  values (
    new.id,
    coalesce(new.email, new.id::text || '@placeholder.local'),
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'region', 'egypt'),
    public.normalise_egyptian_mobile(new.raw_user_meta_data ->> 'phone')
  )
  on conflict (id) do nothing;
  return new;
exception
  -- Unchanged from migration 005: a profile must never be the reason an
  -- account cannot be created.
  when others then
    raise warning 'handle_new_user failed for %: %', new.id, sqlerrm;
    return new;
end;
$$;

-- Tidy numbers already on file into the same shape, so existing students do
-- not have to re-enter a number that was fine, just formatted differently.
-- Numbers that do not normalise are left exactly as they are, not wiped: this
-- is cleanup, and someone's only record of a contact must not vanish in it.
update public.profiles
   set phone = public.normalise_egyptian_mobile(phone)
 where phone is not null
   and public.normalise_egyptian_mobile(phone) is not null
   and phone <> public.normalise_egyptian_mobile(phone);

-- ---------- 2. TASKS ACCEPT ANY FILE TYPE BY DEFAULT ----------
--
-- An empty allowed_file_types now means "any file" — the upload route still
-- refuses executables whatever a task says (see BLOCKED_EXTENSIONS in
-- /api/tasks/upload-session). A task can still be restricted by listing
-- extensions in Task setup.

alter table public.assignments
  alter column allowed_file_types set default array[]::text[];

-- Existing tasks were created when STL was the only option, not because anyone
-- chose to restrict them. Open them up; restrict any that should stay STL-only
-- from Task setup afterwards.
update public.assignments
   set allowed_file_types = array[]::text[]
 where allowed_file_types = array['.stl']::text[];

notify pgrst, 'reload schema';
