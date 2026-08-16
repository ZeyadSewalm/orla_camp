-- =============================================================
-- OrlaDent Camp — Migration 005: auth repair
--
-- Run ONCE in the Supabase SQL editor, after migration-004-fixes.sql.
-- Additive and idempotent — safe to re-run.
--
-- CONTEXT
-- Passwords live in auth.users.encrypted_password, hashed with bcrypt by
-- Supabase itself. Nothing in this file — and nothing in the app — hashes or
-- compares a password. That is deliberate: the application has no access to
-- the auth schema's password column, so any comparison it attempted would
-- always fail. Creating an account is done with the Admin API:
--     npm run create-admin -- admin@orladent.com 'a-strong-password'
--
-- What this file fixes is the OTHER half of "Invalid login credentials":
-- accounts whose auth user exists but whose profiles row does not, which
-- leaves the middleware unable to read a role and bounces the user out.
-- =============================================================

-- ---------- FIX 1: backfill missing profile rows ----------
-- The on_auth_user_created trigger handles new signups, but any user created
-- before it existed (or while it was failing) has no profiles row. Without one
-- the header shows nothing, middleware finds no role, and /course redirects
-- to /pricing forever.
insert into public.profiles (id, email, full_name, region)
select
  u.id,
  u.email,
  coalesce(u.raw_user_meta_data ->> 'full_name', ''),
  coalesce(u.raw_user_meta_data ->> 'region', 'egypt')
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
  and u.email is not null
on conflict (id) do nothing;

-- ---------- FIX 2: make the trigger survive a missing email ----------
-- profiles.email is NOT NULL. A user created without an email (phone signup,
-- or some OAuth providers) makes the trigger raise, and Supabase reports that
-- to the client as "Database error saving new user" — the signup silently
-- never happens, and the later login then fails as invalid credentials.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, region)
  values (
    new.id,
    coalesce(new.email, new.id::text || '@placeholder.local'),
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'region', 'egypt')
  )
  on conflict (id) do nothing;
  return new;
exception
  -- A profile is descriptive data. It must never be the reason an account
  -- cannot be created; the backfill above catches whatever is missed here.
  when others then
    raise warning 'handle_new_user failed for %: %', new.id, sqlerrm;
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- FIX 3: keep the profile email in step ----------
-- Changing an email in the Supabase dashboard used to leave profiles.email
-- stale, so the admin panel showed the old address.
create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is distinct from old.email and new.email is not null then
    update public.profiles set email = new.email where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function public.handle_user_email_change();

-- =============================================================
-- PROMOTE AN EXISTING ACCOUNT TO ADMIN
-- Sign up through the site first, then run this with your email:
--
--   update public.profiles
--      set role = 'admin', has_access = true
--    where email = 'you@example.com';
--
-- CHECK WHAT ACTUALLY EXISTS (run this before assuming a password is wrong):
--
--   select u.email,
--          u.email_confirmed_at is not null as confirmed,
--          p.role,
--          p.has_access
--     from auth.users u
--     left join public.profiles p on p.id = u.id
--    order by u.created_at desc;
--
-- confirmed = false is a login that fails no matter how right the password is.
-- =============================================================
