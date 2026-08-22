-- =============================================================
-- OrlaDent Camp — Supabase schema (run top to bottom in the SQL editor)
-- =============================================================

create extension if not exists "pgcrypto";

-- ---------- 1. TIERS ----------
create table if not exists tiers (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name_ar text not null,
  name_en text not null,
  description_ar text,
  description_en text,
  price_egp numeric,
  price_usd numeric,
  installments_available boolean default false,
  installment_count int default 3,
  installment_price_egp numeric,
  installment_price_usd numeric,
  is_self_checkout boolean default true,
  max_seats int,
  current_seats_taken int default 0,
  features jsonb,
  order_index int default 0
);

-- ---------- 2. PROFILES ----------
create table if not exists profiles (
  id uuid references auth.users on delete cascade primary key,
  email text not null,
  full_name text,
  region text default 'egypt',
  tier_id uuid references tiers(id),
  has_access boolean default false,
  role text default 'user',
  created_at timestamp default now()
);

-- ---------- 3. PROMO CODES ----------
create table if not exists promo_codes (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  discount_type text not null,
  discount_value numeric not null,
  applicable_tiers uuid[],
  is_active boolean default true,
  max_uses int,
  used_count int default 0,
  expires_at timestamp,
  created_at timestamp default now()
);

-- ---------- 4. PAYMENTS ----------
create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  tier_id uuid references tiers(id),
  amount numeric not null,
  currency text not null,
  is_installment boolean default false,
  installment_number int,
  status text default 'pending',
  payment_method text,
  provider_reference text,
  promo_code_id uuid references promo_codes(id),
  created_at timestamp default now(),
  paid_at timestamp
);
create index if not exists payments_ref_idx on payments(provider_reference);

-- ---------- 5. COURSE MODULES ----------
create table if not exists course_modules (
  id uuid primary key default gen_random_uuid(),
  title_ar text not null,
  title_en text not null,
  description_ar text,
  description_en text,
  video_link text not null,
  checklist_file_url text,
  order_index int not null,
  created_at timestamp default now()
);

-- ---------- 6. CASE FILE SUBMISSIONS ----------
create table if not exists case_file_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade not null,
  module_id uuid references course_modules(id) on delete set null,
  file_url text not null,
  file_name text,
  status text default 'pending',
  reviewer_notes text,
  reviewed_by text,
  submitted_at timestamp default now(),
  reviewed_at timestamp
);

-- ---------- 7. LIVE SESSIONS ----------
create table if not exists live_sessions (
  id uuid primary key default gen_random_uuid(),
  title_ar text not null,
  title_en text not null,
  scheduled_at timestamp not null,
  join_link text,
  recording_link text,
  min_tier_order int default 2,
  created_at timestamp default now()
);

-- ---------- 8. COMMUNITY SETTINGS ----------
create table if not exists community_settings (
  id int primary key default 1,
  whatsapp_group_link text,
  min_tier_order int default 2
);

-- ---------- 9. PRODUCTION PARTNER REQUESTS ----------
create table if not exists production_partner_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete set null,
  full_name text not null,
  email text not null,
  phone text,
  message text,
  status text default 'pending',
  agreed_price numeric,
  agreed_currency text,
  admin_notes text,
  created_at timestamp default now()
);

-- ---------- 10. SITE SETTINGS ----------
create table if not exists site_settings (
  id int primary key default 1,
  landing_title_ar text default 'OrlaDent Camp',
  landing_title_en text default 'OrlaDent Camp',
  landing_description_ar text default '',
  landing_description_en text default '',
  landing_image_url text
);

-- ---------- 11. STUDENT LESSON PROGRESS ----------
create table if not exists lesson_progress (
  user_id uuid references profiles(id) on delete cascade not null,
  module_id uuid references course_modules(id) on delete cascade not null,
  is_completed boolean not null default false,
  watch_seconds integer not null default 0 check (watch_seconds >= 0),
  started_at timestamptz not null default now(),
  last_watched_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, module_id)
);
create index if not exists lesson_progress_user_recent_idx
  on lesson_progress (user_id, last_watched_at desc);

-- =============================================================
-- HELPERS
-- =============================================================

-- Admin check without recursive RLS lookups on profiles.
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin');
$$;

-- The tier order_index of the signed-in user (0 when no active tier).
create or replace function public.my_tier_order()
returns int
language sql
security definer
set search_path = public
as $$
  select coalesce(
    (select t.order_index from profiles p join tiers t on t.id = p.tier_id
      where p.id = auth.uid() and p.has_access = true), 0);
$$;

-- Atomic progress helpers used by the student course page.
create or replace function public.record_lesson_watch(p_module_id uuid, p_seconds integer default 0)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  safe_seconds integer := greatest(0, least(coalesce(p_seconds, 0), 120));
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if not exists (select 1 from profiles p where p.id = auth.uid()
                 and (coalesce(p.has_access, false) or p.role in ('admin','reviewer'))) then
    raise exception 'course access required';
  end if;
  insert into lesson_progress (user_id, module_id, watch_seconds, started_at, last_watched_at, updated_at)
  values (auth.uid(), p_module_id, safe_seconds, now(), now(), now())
  on conflict (user_id, module_id) do update
    set watch_seconds = lesson_progress.watch_seconds + safe_seconds,
        last_watched_at = now(), updated_at = now();
end;
$$;

create or replace function public.set_lesson_complete(p_module_id uuid, p_completed boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if not exists (select 1 from profiles p where p.id = auth.uid()
                 and (coalesce(p.has_access, false) or p.role in ('admin','reviewer'))) then
    raise exception 'course access required';
  end if;
  insert into lesson_progress (user_id, module_id, is_completed, completed_at, started_at, last_watched_at, updated_at)
  values (auth.uid(), p_module_id, coalesce(p_completed, false),
          case when coalesce(p_completed, false) then now() else null end, now(), now(), now())
  on conflict (user_id, module_id) do update
    set is_completed = excluded.is_completed,
        completed_at = case when excluded.is_completed then coalesce(lesson_progress.completed_at, now()) else null end,
        last_watched_at = now(), updated_at = now();
end;
$$;

revoke all on function public.record_lesson_watch(uuid, integer) from public;
revoke execute on function public.record_lesson_watch(uuid, integer) from anon;
grant execute on function public.record_lesson_watch(uuid, integer) to authenticated;
revoke all on function public.set_lesson_complete(uuid, boolean) from public;
revoke execute on function public.set_lesson_complete(uuid, boolean) from anon;
grant execute on function public.set_lesson_complete(uuid, boolean) to authenticated;

-- Create a profile row automatically for every new auth user.
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
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'region', 'egypt')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =============================================================
-- ROW LEVEL SECURITY
-- =============================================================

alter table tiers                       enable row level security;
alter table profiles                    enable row level security;
alter table promo_codes                 enable row level security;
alter table payments                    enable row level security;
alter table course_modules              enable row level security;
alter table case_file_submissions       enable row level security;
alter table live_sessions               enable row level security;
alter table community_settings          enable row level security;
alter table production_partner_requests enable row level security;
alter table site_settings               enable row level security;
alter table lesson_progress             enable row level security;

-- tiers: public read, admin write
create policy "tiers public read"  on tiers for select using (true);
create policy "tiers admin write"  on tiers for all    using (is_admin()) with check (is_admin());

-- profiles: own row read/update, admin all
create policy "profiles own read"   on profiles for select using (id = auth.uid() or is_admin());
create policy "profiles own update" on profiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy "profiles admin write" on profiles for all using (is_admin()) with check (is_admin());

-- promo codes: admin only (validation happens server-side with the service role)
create policy "promo admin all" on promo_codes for all using (is_admin()) with check (is_admin());

-- payments: own rows read, admin all. Inserts/updates happen server-side.
create policy "payments own read" on payments for select using (user_id = auth.uid() or is_admin());
create policy "payments admin all" on payments for all using (is_admin()) with check (is_admin());

-- course modules: metadata is public (used on the landing page), the video link
-- is only ever selected through a server component that checks has_access first.
create policy "modules public read" on course_modules for select using (true);
create policy "modules admin write" on course_modules for all using (is_admin()) with check (is_admin());

-- case files: owner + admin
create policy "cases own read"   on case_file_submissions for select using (user_id = auth.uid() or is_admin());
create policy "cases own insert" on case_file_submissions for insert with check (user_id = auth.uid());
create policy "cases admin all"  on case_file_submissions for all using (is_admin()) with check (is_admin());

-- live sessions: only visible to members at or above the session's min tier
create policy "sessions tier read" on live_sessions
  for select using (my_tier_order() >= min_tier_order or is_admin());
create policy "sessions admin write" on live_sessions for all using (is_admin()) with check (is_admin());

-- community: same gating
create policy "community tier read" on community_settings
  for select using (my_tier_order() >= min_tier_order or is_admin());
create policy "community admin write" on community_settings for all using (is_admin()) with check (is_admin());

-- production partner requests: own + admin
create policy "ppr own read"   on production_partner_requests for select using (user_id = auth.uid() or is_admin());
create policy "ppr own insert" on production_partner_requests for insert with check (true);
create policy "ppr admin all"  on production_partner_requests for all using (is_admin()) with check (is_admin());

-- site settings: public read, admin write
create policy "settings public read" on site_settings for select using (true);
create policy "settings admin write" on site_settings for all using (is_admin()) with check (is_admin());

-- student progress: learners can read their own rows; writes go through RPCs
create policy "lesson progress own read" on lesson_progress
  for select using (user_id = auth.uid() or is_admin());
create policy "lesson progress own insert" on lesson_progress
  for insert with check (user_id = auth.uid());
create policy "lesson progress own update" on lesson_progress
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke insert, update on lesson_progress from authenticated;
grant select on lesson_progress to authenticated;

-- =============================================================
-- STORAGE BUCKETS
-- =============================================================
insert into storage.buckets (id, name, public)
values ('checklists', 'checklists', true), ('landing', 'landing', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('case-files', 'case-files', false)
on conflict (id) do nothing;

-- Case files live at case-files/<user_id>/<filename>. Owner + admin only.
create policy "case files owner read" on storage.objects for select
  using (bucket_id = 'case-files' and (owner = auth.uid() or is_admin()));
create policy "case files owner insert" on storage.objects for insert
  with check (bucket_id = 'case-files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "case files admin all" on storage.objects for all
  using (bucket_id = 'case-files' and is_admin());

create policy "public buckets read" on storage.objects for select
  using (bucket_id in ('checklists','landing'));
create policy "public buckets admin write" on storage.objects for all
  using (bucket_id in ('checklists','landing') and is_admin());

-- =============================================================
-- SEED (edit everything later from /admin — no code changes needed)
-- =============================================================
insert into site_settings (id, landing_description_ar, landing_description_en)
values (1,
  'تدريب عملي على تصميم الأسنان الرقمي، من الأساسيات لحالات الزرع الكاملة — بمراجعة حقيقية لملفاتك من Badr.',
  'Hands-on digital dental design training, from the basics to full-arch implant cases — with real case-file review from Badr.')
on conflict (id) do nothing;

insert into community_settings (id, whatsapp_group_link, min_tier_order)
values (1, '', 2) on conflict (id) do nothing;

insert into tiers (slug, name_ar, name_en, description_ar, description_en,
  price_egp, price_usd, installments_available, installment_price_egp, installment_price_usd,
  is_self_checkout, max_seats, order_index, features)
values
('foundation', 'Foundation', 'Foundation',
 'الأساسيات: تتعلم السيستم من الصفر وتشتغل على تشيك ليست كل موديول.',
 'The fundamentals: learn the system from zero and work through every module checklist.',
 12000, 260, true, 4400, 95, true, null, 1,
 '{"ar":["كل موديولات الأساسيات","تشيك ليست PDF لكل موديول","تحديثات المكتبة مدى الاشتراك"],"en":["All foundation modules","PDF checklist per module","Library updates for the life of the plan"]}'),
('freelance_ready', 'Freelance Ready', 'Freelance Ready',
 'كل المحتوى + مراجعة ملفات حالاتك + المجتمع وجلسات الأسئلة الأسبوعية.',
 'Everything, plus case-file review, the community, and weekly live Q&A.',
 22000, 480, true, 8000, 175, true, null, 2,
 '{"ar":["كل الموديولات لحد حالات الـ full-arch","مراجعة ملفات الحالات من Badr","جروب الواتساب","جلسات أسئلة وأجوبة أسبوعية لايف + التسجيلات"],"en":["Every module through full-arch cases","Case-file review by Badr","WhatsApp community","Weekly live Q&A + recordings"]}'),
('production_partner', 'Production Partner', 'Production Partner',
 '3 أماكن فقط. شغل حقيقي جنب Badr وسعر متفق عليه لكل طالب.',
 '3 seats only. Real production work alongside Badr, priced per student.',
 null, null, false, null, null, false, 3, 3,
 '{"ar":["كل مميزات Freelance Ready","مراجعة أعمق وأسرع لملفات الحالات","متابعة شخصية مع Badr","3 أماكن فقط"],"en":["Everything in Freelance Ready","Deeper, faster case-file review","One-to-one follow-up with Badr","3 seats only"]}')
on conflict (slug) do nothing;

-- Make yourself an admin after signing up:
-- update profiles set role = 'admin' where email = 'you@example.com';
