-- 038: restrict database access using the existing trusted profiles role/link.

create or replace function public.is_current_user_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;
revoke all on function public.is_current_user_admin() from public, anon;
grant execute on function public.is_current_user_admin() to authenticated, service_role;

create or replace function public.current_user_member_id()
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select p.member_id
  from public.profiles p
  where p.id = auth.uid()
    and p.role = 'member'
    and p.member_id is not null;
$$;
revoke all on function public.current_user_member_id() from public, anon;
grant execute on function public.current_user_member_id() to authenticated, service_role;

create or replace function public.link_my_member_profile(p_member_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_member_id uuid;
begin
  if v_user_id is null then
    raise exception 'An authenticated account is required';
  end if;

  select p.member_id into v_member_id
  from public.profiles p
  where p.id = v_user_id and p.role = 'member';
  if not found or v_member_id is null then
    return null;
  end if;

  if p_member_id is not null and p_member_id <> v_member_id then
    raise exception 'The requested member is not linked to this account';
  end if;

  return v_member_id;
end;
$$;
revoke all on function public.link_my_member_profile(uuid) from public, anon;
grant execute on function public.link_my_member_profile(uuid) to authenticated;

create or replace function public.find_or_create_company(p_name text)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_company_id uuid;
  v_name text := btrim(p_name);
begin
  if auth.uid() is null or v_name is null or v_name = '' or length(v_name) > 200 then
    raise exception 'A valid company name and authenticated account are required';
  end if;
  if not public.is_current_user_admin() and public.current_user_member_id() is null then
    raise exception 'An approved, linked member account is required';
  end if;
  select id into v_company_id from public.companies where lower(name)=lower(v_name) limit 1;
  if v_company_id is null then
    insert into public.companies(name) values(v_name) returning id into v_company_id;
  end if;
  return v_company_id;
end;
$$;
revoke all on function public.find_or_create_company(text) from public, anon;
grant execute on function public.find_or_create_company(text) to authenticated;

-- Row logging and email matching must keep working after the history and
-- member tables gain RLS. They write only trigger-derived rows or a link
-- whose target comes from the submitted email.
alter function public.log_members_history() security definer set search_path = pg_catalog, public;
alter function public.log_companies_history() security definer set search_path = pg_catalog, public;
alter function public.log_member_profile_history() security definer set search_path = pg_catalog, public;
alter function public.log_employment_history() security definer set search_path = pg_catalog, public;
do $$
begin
  if to_regprocedure('public.link_otr_to_member()') is not null then
    execute 'alter function public.link_otr_to_member() security definer set search_path = pg_catalog, public';
  end if;
end $$;

alter table public.profiles enable row level security;
alter table public.members enable row level security;
alter table public.member_profile enable row level security;
alter table public.employment_history enable row level security;
alter table public.member_data enable row level security;
alter table public.interactions enable row level security;
alter table public.member_socials enable row level security;
alter table public.event_signups enable row level security;
alter table public.notifications enable row level security;
alter table public.companies enable row level security;
alter table public.events enable row level security;
alter table public.profile_update_submissions enable row level security;

-- Remove the temporary allow-all policies found in the current project
-- catalog. Permissive policies are combined with OR, so adding safer policies
-- does not restrict access while any of these remain.
do $$
declare
  old_policy record;
begin
  -- Clean every observed instance in the schema, including tables that do
  -- not have a replacement policy in the main access-policy section below.
  for old_policy in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and policyname in ('temp_allow_all', 'temp_all')
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      old_policy.policyname, old_policy.schemaname, old_policy.tablename
    );
  end loop;
end $$;

-- Row-level security does not protect against TRUNCATE.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'companies', 'companies_history', 'duplicate_flags', 'employment_history',
    'employment_history_log', 'enrichment_runs', 'event_signups', 'events',
    'interactions', 'join_us_applications', 'Member Data (Cleaned)',
    'member_data', 'member_profile', 'member_profile_history', 'member_socials',
    'members', 'members_history', 'metro_areas', 'newsletter_engagement',
    'notifications', 'otr_applications', 'processed_emails',
    'profile_update_submissions', 'profiles',
    'speaker_applications', 'substack_engagement_snapshots',
    'substack_import_runs', 'substack_subscribers'
  ] loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format(
        'revoke truncate on table public.%I from public, anon, authenticated',
        table_name
      );
    end if;
  end loop;
end $$;

drop policy if exists profiles_read_self_or_admin on public.profiles;
create policy profiles_read_self_or_admin on public.profiles for select to authenticated
using (id = auth.uid() or public.is_current_user_admin());
drop policy if exists profiles_update_self_or_admin on public.profiles;
create policy profiles_update_self_or_admin on public.profiles for update to authenticated
using (id = auth.uid() or public.is_current_user_admin())
with check (id = auth.uid() or public.is_current_user_admin());
revoke insert, update on public.profiles from public, anon, authenticated;
grant update (full_name, avatar_url) on public.profiles to authenticated;
grant select on public.profiles to authenticated;

drop policy if exists members_admin_all on public.members;
create policy members_admin_all on public.members for all to authenticated
using (public.is_current_user_admin()) with check (public.is_current_user_admin());
drop policy if exists members_read_own on public.members;
create policy members_read_own on public.members for select to authenticated
using (public.current_user_member_id() = members.id);
drop policy if exists members_insert_own on public.members;
drop policy if exists members_update_own on public.members;
create policy members_update_own on public.members for update to authenticated
using (public.current_user_member_id() = members.id)
with check (public.current_user_member_id() = members.id);

drop policy if exists member_profile_admin_all on public.member_profile;
create policy member_profile_admin_all on public.member_profile for all to authenticated
using (public.is_current_user_admin()) with check (public.is_current_user_admin());
drop policy if exists member_profile_read_own on public.member_profile;
drop policy if exists member_profile_insert_own on public.member_profile;
drop policy if exists member_profile_update_own on public.member_profile;

-- RLS cannot hide selected columns. Members read a fixed safe-field projection
-- through this function; direct table reads remain administrator-only.
create or replace function public.get_my_member_profile()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select jsonb_build_object(
    'id', mp.id,
    'member_id', mp.member_id,
    'company_id', mp.company_id,
    'company_name', c.name,
    'company_size', c.size,
    'company_industry', c.industry,
    'seniority_level', mp.seniority_level,
    'current_job_start_date', mp.current_job_start_date,
    'team_size', mp.team_size,
    'management_layers', mp.management_layers,
    'address', mp.address,
    'city', mp.city,
    'state_region', mp.state_region,
    'zip_code', mp.zip_code,
    'country', mp.country,
    'tshirt_size', mp.tshirt_size,
    'dietary_restrictions', mp.dietary_restrictions,
    'event_interest', mp.event_interest,
    'oversees_solutions_engineering_consulting', mp.oversees_solutions_engineering_consulting,
    'oversees_customer_success', mp.oversees_customer_success,
    'oversees_demo_engineering', mp.oversees_demo_engineering,
    'oversees_solutions_architecture', mp.oversees_solutions_architecture,
    'oversees_partnerships_channel_se', mp.oversees_partnerships_channel_se,
    'oversees_value_engineering', mp.oversees_value_engineering,
    'oversees_forward_deployed_engineering', mp.oversees_forward_deployed_engineering,
    'oversees_enablement', mp.oversees_enablement,
    'oversees_professional_services', mp.oversees_professional_services,
    'oversees_implementation_onboarding', mp.oversees_implementation_onboarding,
    'region_north_america', mp.region_north_america,
    'region_regional_usa', mp.region_regional_usa,
    'region_global', mp.region_global,
    'region_emea', mp.region_emea,
    'region_apac', mp.region_apac,
    'region_latin_america', mp.region_latin_america,
    'updated_at', mp.updated_at
  )
  from public.profiles p
  join public.member_profile mp on mp.member_id = p.member_id
  left join public.companies c on c.id = mp.company_id
  where p.id = auth.uid()
    and p.role = 'member'
    and p.member_id = public.current_user_member_id()
  order by mp.updated_at desc nulls last, mp.id desc
  limit 1;
$$;

-- Self-service writes use a strict allowlist too, preserving an existing
-- trusted profile link and never accepting internal classification fields.
create or replace function public.save_my_member_profile(p_values jsonb)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_member_id uuid := public.current_user_member_id();
  v_profile_id uuid;
  v_values jsonb;
begin
  if auth.uid() is null or v_member_id is null or not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'member' and p.member_id = v_member_id
  ) then
    raise exception 'A linked member account is required';
  end if;

  select to_jsonb(mp) - array[
    'icp', 'bucket', 'fit_score', 'tag_note', 'tagged_by', 'tagged_at',
    'tagged_manually', 'work_email_enriched', 'additional_emails',
    'signup_source', 'tags', 'metro_area_id'
  ]
  into v_values
  from public.member_profile mp
  where mp.member_id = v_member_id
  order by mp.updated_at desc nulls last, mp.id desc
  limit 1;
  select mp.id into v_profile_id
  from public.member_profile mp
  where mp.member_id = v_member_id
  order by mp.updated_at desc nulls last, mp.id desc
  limit 1;
  v_values := coalesce(v_values, '{}'::jsonb) || coalesce(p_values, '{}'::jsonb);

  insert into public.member_profile (
    id, member_id, company_id, seniority_level, team_size, management_layers,
    address, city, state_region, zip_code, country, tshirt_size,
    dietary_restrictions, event_interest,
    oversees_solutions_engineering_consulting, oversees_customer_success,
    oversees_demo_engineering, oversees_solutions_architecture,
    oversees_partnerships_channel_se, oversees_value_engineering,
    oversees_forward_deployed_engineering, oversees_enablement,
    oversees_professional_services, oversees_implementation_onboarding,
    region_north_america,
    region_regional_usa, region_global, region_emea, region_apac,
    region_latin_america, updated_at
  ) values (
    coalesce(v_profile_id, gen_random_uuid()), v_member_id,
    nullif(v_values->>'company_id', '')::uuid,
    v_values->>'seniority_level',
    nullif(v_values->>'team_size', '')::integer,
    v_values->>'management_layers', v_values->>'address', v_values->>'city',
    v_values->>'state_region', v_values->>'zip_code', v_values->>'country',
    nullif(v_values->>'tshirt_size', '')::public.tshirt_size,
    v_values->>'dietary_restrictions', v_values->>'event_interest',
    coalesce((v_values->>'oversees_solutions_engineering_consulting')::boolean, false),
    coalesce((v_values->>'oversees_customer_success')::boolean, false),
    coalesce((v_values->>'oversees_demo_engineering')::boolean, false),
    coalesce((v_values->>'oversees_solutions_architecture')::boolean, false),
    coalesce((v_values->>'oversees_partnerships_channel_se')::boolean, false),
    coalesce((v_values->>'oversees_value_engineering')::boolean, false),
    coalesce((v_values->>'oversees_forward_deployed_engineering')::boolean, false),
    coalesce((v_values->>'oversees_enablement')::boolean, false),
    coalesce((v_values->>'oversees_professional_services')::boolean, false),
    coalesce((v_values->>'oversees_implementation_onboarding')::boolean, false),
    coalesce((v_values->>'region_north_america')::boolean, false),
    coalesce((v_values->>'region_regional_usa')::boolean, false),
    coalesce((v_values->>'region_global')::boolean, false),
    coalesce((v_values->>'region_emea')::boolean, false),
    coalesce((v_values->>'region_apac')::boolean, false),
    coalesce((v_values->>'region_latin_america')::boolean, false),
    now()
  )
  on conflict (id) do update set
    company_id = excluded.company_id,
    seniority_level = excluded.seniority_level,
    team_size = excluded.team_size,
    management_layers = excluded.management_layers,
    address = excluded.address,
    city = excluded.city,
    state_region = excluded.state_region,
    zip_code = excluded.zip_code,
    country = excluded.country,
    tshirt_size = excluded.tshirt_size,
    dietary_restrictions = excluded.dietary_restrictions,
    event_interest = excluded.event_interest,
    oversees_solutions_engineering_consulting = excluded.oversees_solutions_engineering_consulting,
    oversees_customer_success = excluded.oversees_customer_success,
    oversees_demo_engineering = excluded.oversees_demo_engineering,
    oversees_solutions_architecture = excluded.oversees_solutions_architecture,
    oversees_partnerships_channel_se = excluded.oversees_partnerships_channel_se,
    oversees_value_engineering = excluded.oversees_value_engineering,
    oversees_forward_deployed_engineering = excluded.oversees_forward_deployed_engineering,
    oversees_enablement = excluded.oversees_enablement,
    oversees_professional_services = excluded.oversees_professional_services,
    oversees_implementation_onboarding = excluded.oversees_implementation_onboarding,
    region_north_america = excluded.region_north_america,
    region_regional_usa = excluded.region_regional_usa,
    region_global = excluded.region_global,
    region_emea = excluded.region_emea,
    region_apac = excluded.region_apac,
    region_latin_america = excluded.region_latin_america,
    updated_at = now();

  return true;
end;
$$;
revoke all on function public.get_my_member_profile() from public, anon;
grant execute on function public.get_my_member_profile() to authenticated;
revoke all on function public.save_my_member_profile(jsonb) from public, anon;
grant execute on function public.save_my_member_profile(jsonb) to authenticated;

drop policy if exists employment_history_admin_all on public.employment_history;
create policy employment_history_admin_all on public.employment_history for all to authenticated
using (public.is_current_user_admin()) with check (public.is_current_user_admin());
drop policy if exists employment_history_read_own on public.employment_history;
create policy employment_history_read_own on public.employment_history for select to authenticated
using (public.current_user_member_id() = employment_history.member_id);
drop policy if exists employment_history_write_own on public.employment_history;
create policy employment_history_write_own on public.employment_history for all to authenticated
using (public.current_user_member_id() = employment_history.member_id)
with check (public.current_user_member_id() = employment_history.member_id);

drop policy if exists member_data_admin_all on public.member_data;
create policy member_data_admin_all on public.member_data for all to authenticated
using (public.is_current_user_admin()) with check (public.is_current_user_admin());
drop policy if exists member_data_read_own_editable on public.member_data;
create policy member_data_read_own_editable on public.member_data for select to authenticated
using (tier = 'user_editable' and public.current_user_member_id() = member_data.member_id);
drop policy if exists member_data_write_own_editable on public.member_data;
create policy member_data_write_own_editable on public.member_data for all to authenticated
using (tier = 'user_editable' and public.current_user_member_id() = member_data.member_id)
with check (tier = 'user_editable' and public.current_user_member_id() = member_data.member_id);

drop policy if exists interactions_admin_all on public.interactions;
create policy interactions_admin_all on public.interactions for all to authenticated
using (public.is_current_user_admin()) with check (public.is_current_user_admin());

drop policy if exists member_socials_admin_all on public.member_socials;
drop policy if exists "Admins can insert socials" on public.member_socials;
drop policy if exists "Admins can read socials" on public.member_socials;
drop policy if exists "Members can read own socials" on public.member_socials;
create policy member_socials_admin_all on public.member_socials for all to authenticated
using (public.is_current_user_admin()) with check (public.is_current_user_admin());
drop policy if exists member_socials_own_all on public.member_socials;
create policy member_socials_own_all on public.member_socials for all to authenticated
using (public.current_user_member_id() = member_socials.member_id)
with check (public.current_user_member_id() = member_socials.member_id);

drop policy if exists event_signups_admin_all on public.event_signups;
create policy event_signups_admin_all on public.event_signups for all to authenticated
using (public.is_current_user_admin()) with check (public.is_current_user_admin());
drop policy if exists event_signups_read_own on public.event_signups;
create policy event_signups_read_own on public.event_signups for select to authenticated
using (public.current_user_member_id() = event_signups.member_id);
drop policy if exists event_signups_insert_own on public.event_signups;
create policy event_signups_insert_own on public.event_signups for insert to authenticated
with check (public.current_user_member_id() = event_signups.member_id);

drop policy if exists notifications_admin_all on public.notifications;
create policy notifications_admin_all on public.notifications for all to authenticated
using (public.is_current_user_admin()) with check (public.is_current_user_admin());
drop policy if exists notifications_read_own on public.notifications;
create policy notifications_read_own on public.notifications for select to authenticated
using (public.current_user_member_id() = notifications.member_id);
drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications for update to authenticated
using (public.current_user_member_id() = notifications.member_id)
with check (public.current_user_member_id() = notifications.member_id);
drop policy if exists notifications_insert_own on public.notifications;
create policy notifications_insert_own on public.notifications for insert to authenticated
with check (type in ('profile_updated', 'new_signup')
  and public.current_user_member_id() = notifications.member_id);
revoke update on public.notifications from public, anon, authenticated;
grant update (is_read) on public.notifications to authenticated;

alter table public.duplicate_flags enable row level security;
drop policy if exists duplicate_flags_admin_all on public.duplicate_flags;
create policy duplicate_flags_admin_all on public.duplicate_flags for all to authenticated
using (public.is_current_user_admin()) with check (public.is_current_user_admin());

-- Keep historical and operational datasets private to the admin workspace.
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'Member Data (Cleaned)', 'members_history', 'companies_history', 'member_profile_history',
    'employment_history_log', 'enrichment_runs', 'processed_emails', 'speaker_applications',
    'substack_subscribers', 'substack_engagement_snapshots', 'substack_import_runs',
    'newsletter_engagement', 'join_us_applications'
  ] loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format('alter table public.%I enable row level security', table_name);
      execute format('drop policy if exists %I on public.%I', table_name || '_admin_all', table_name);
      execute format(
        'create policy %I on public.%I for all to authenticated using (public.is_current_user_admin()) with check (public.is_current_user_admin())',
        table_name || '_admin_all', table_name
      );
    end if;
  end loop;
end $$;

-- Metro areas are non-sensitive reference data used by member/admin filters.
alter table public.metro_areas enable row level security;
drop policy if exists metro_areas_authenticated_read on public.metro_areas;
create policy metro_areas_authenticated_read on public.metro_areas for select to authenticated using (true);

-- Speaker applications are a member-submitted workflow, not an admin-only
-- dataset. Keep submissions pending and readable only by their owner.
do $$
begin
  if to_regclass('public.speaker_applications') is not null then
    execute 'drop policy if exists "Admins can manage applications" on public.speaker_applications';
    execute 'drop policy if exists "Members can read own applications" on public.speaker_applications';
    execute 'drop policy if exists "Members can submit applications" on public.speaker_applications';
    execute 'drop policy if exists speaker_applications_admin_all on public.speaker_applications';
    execute 'create policy speaker_applications_admin_all on public.speaker_applications for all to authenticated using (public.is_current_user_admin()) with check (public.is_current_user_admin())';
    execute 'drop policy if exists speaker_applications_read_own on public.speaker_applications';
    execute 'create policy speaker_applications_read_own on public.speaker_applications for select to authenticated using (member_id = public.current_user_member_id())';
    execute 'drop policy if exists speaker_applications_insert_own on public.speaker_applications';
    execute 'create policy speaker_applications_insert_own on public.speaker_applications for insert to authenticated with check (member_id = public.current_user_member_id() and status = ''pending'')';
  end if;
end $$;

-- OTR is a public application intake. Preserve anonymous submissions while
-- preventing public callers from assigning approved statuses or reading rows.
create or replace function public.force_otr_pending_for_nonadmins()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.role() in ('anon', 'authenticated') and not public.is_current_user_admin() then
    new.status := 'Pending';
    new.acceptance_email_sent_at := null;
  end if;
  return new;
end;
$$;
revoke all on function public.force_otr_pending_for_nonadmins() from public, anon, authenticated;

do $$
begin
  if to_regclass('public.otr_applications') is not null then
    execute 'alter table public.otr_applications enable row level security';
    execute 'revoke all on public.otr_applications from public, anon, authenticated';
    execute 'grant insert on public.otr_applications to anon';
    execute 'grant select, insert, update, delete on public.otr_applications to authenticated';
    execute 'drop policy if exists otr_applications_admin_all on public.otr_applications';
    execute 'create policy otr_applications_admin_all on public.otr_applications for all to authenticated using (public.is_current_user_admin()) with check (public.is_current_user_admin())';
    execute 'drop policy if exists otr_applications_public_insert on public.otr_applications';
    execute 'create policy otr_applications_public_insert on public.otr_applications for insert to anon, authenticated with check (status = ''Pending'')';
    execute 'drop trigger if exists trg_otr_submission_pending_insert on public.otr_applications';
    execute 'drop trigger if exists trg_otr_submission_pending_update on public.otr_applications';
    execute 'create trigger trg_otr_submission_pending_insert before insert on public.otr_applications for each row execute function public.force_otr_pending_for_nonadmins()';
    execute 'create trigger trg_otr_submission_pending_update before update of status on public.otr_applications for each row execute function public.force_otr_pending_for_nonadmins()';
  end if;
end $$;

drop policy if exists companies_authenticated_read on public.companies;
create policy companies_authenticated_read on public.companies for select to authenticated using (true);
drop policy if exists companies_admin_write on public.companies;
create policy companies_admin_write on public.companies for all to authenticated
using (public.is_current_user_admin()) with check (public.is_current_user_admin());

drop policy if exists events_public_read on public.events;
create policy events_public_read on public.events for select to anon, authenticated using (true);
drop policy if exists events_admin_write on public.events;
create policy events_admin_write on public.events for all to authenticated
using (public.is_current_user_admin()) with check (public.is_current_user_admin());

drop policy if exists profile_update_submissions_admin_all on public.profile_update_submissions;
create policy profile_update_submissions_admin_all on public.profile_update_submissions for all to authenticated
using (public.is_current_user_admin()) with check (public.is_current_user_admin());
drop policy if exists profile_update_submissions_insert_own on public.profile_update_submissions;
create policy profile_update_submissions_insert_own on public.profile_update_submissions for insert to authenticated
with check (public.current_user_member_id() = profile_update_submissions.member_id);

-- Preserve the self-service profile flow while blocking profile escalation and
-- preventing members from changing curated ICP/scoring fields.
create or replace function public.prevent_member_security_field_changes()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is not null and not public.is_current_user_admin() then
    if tg_table_name = 'members' then
      if new.email is distinct from old.email then
        raise exception 'Members cannot change their account email through this operation';
      end if;
    elsif tg_table_name = 'member_profile' then
      if new.icp is distinct from old.icp or new.bucket is distinct from old.bucket or
        new.fit_score is distinct from old.fit_score or new.tag_note is distinct from old.tag_note or
        new.tagged_by is distinct from old.tagged_by or new.tagged_at is distinct from old.tagged_at or
        new.tagged_manually is distinct from old.tagged_manually or
        new.work_email_enriched is distinct from old.work_email_enriched or
        new.additional_emails is distinct from old.additional_emails or
        new.signup_source is distinct from old.signup_source or
        new.tags is distinct from old.tags or
        new.metro_area_id is distinct from old.metro_area_id then
        raise exception 'Only administrators can change curated classification fields';
      end if;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists members_protect_account_email on public.members;
create trigger members_protect_account_email before update on public.members
for each row execute function public.prevent_member_security_field_changes();
drop trigger if exists member_profile_protect_classification on public.member_profile;
create trigger member_profile_protect_classification before update on public.member_profile
for each row execute function public.prevent_member_security_field_changes();

create or replace function public.prevent_member_signup_approval_changes()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is not null and not public.is_current_user_admin() then
    if tg_op = 'INSERT' then
      new.rsvp_status := 'registered';
      new.approval_status := 'pending';
    elsif new.approval_status is distinct from old.approval_status or new.rsvp_status is distinct from old.rsvp_status then
      raise exception 'Only administrators can change signup or approval status';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists event_signups_protect_approval on public.event_signups;
create trigger event_signups_protect_approval before insert or update on public.event_signups
for each row execute function public.prevent_member_signup_approval_changes();
revoke all on function public.prevent_member_security_field_changes() from public, anon, authenticated;
revoke all on function public.prevent_member_signup_approval_changes() from public, anon, authenticated;

-- The callable function that creates privileged member records is admin-only.
create or replace function public.create_member_full(
  p_first_name text, p_last_name text, p_email text, p_linkedin_url text,
  p_phone text, p_company_name text, p_current_role text, p_current_start_date date,
  p_team_size integer, p_management_layers text, p_event_interest text,
  p_address text, p_city text, p_state_region text, p_zip_code text, p_country text,
  p_tshirt_size tshirt_size, p_dietary_restrictions text, p_bucket icp_bucket,
  p_fit_score integer, p_tag_note text, p_tagged_by uuid,
  p_oversees_customer_success boolean, p_oversees_demo_engineering boolean,
  p_oversees_enablement boolean, p_oversees_forward_deployed_engineering boolean,
  p_oversees_implementation_onboarding boolean, p_oversees_partnerships_channel_se boolean,
  p_oversees_professional_services boolean, p_oversees_solutions_architecture boolean,
  p_oversees_solutions_engineering_consulting boolean, p_oversees_value_engineering boolean,
  p_region_north_america boolean, p_region_regional_usa boolean, p_region_global boolean,
  p_region_emea boolean, p_region_apac boolean, p_region_latin_america boolean,
  p_socials jsonb
)
returns uuid language plpgsql security definer set search_path = pg_catalog, public, auth
as $$
declare
  v_member_id uuid;
  v_company_id uuid;
  v_social jsonb;
begin
  if auth.role() is distinct from 'service_role'
    and not public.is_current_user_admin() then
    raise exception 'Administrator access required';
  end if;
  insert into public.members (first_name, last_name, email, linkedin_url, phone, record_source, created_at, last_updated)
  values (p_first_name, p_last_name, p_email, p_linkedin_url, p_phone, 'Manual', now(), now()) returning id into v_member_id;
  if p_company_name is not null then
    select id into v_company_id from public.companies where lower(name)=lower(p_company_name) limit 1;
    if v_company_id is null then
      insert into public.companies(name, created_at, updated_at) values (p_company_name, now(), now()) returning id into v_company_id;
    end if;
  end if;
  insert into public.member_profile (
    member_id, company_id, team_size, address, city, state_region, zip_code, country,
    tshirt_size, dietary_restrictions, management_layers, event_interest,
    oversees_customer_success, oversees_demo_engineering, oversees_enablement,
    oversees_forward_deployed_engineering, oversees_implementation_onboarding,
    oversees_partnerships_channel_se, oversees_professional_services,
    oversees_solutions_architecture, oversees_solutions_engineering_consulting,
    oversees_value_engineering, region_north_america, region_regional_usa, region_global,
    region_emea, region_apac, region_latin_america, bucket, fit_score, tag_note,
    tagged_manually, tagged_at, tagged_by, signup_source, updated_at
  ) values (
    v_member_id, v_company_id, p_team_size, p_address, p_city, p_state_region, p_zip_code, p_country,
    p_tshirt_size, p_dietary_restrictions, p_management_layers, p_event_interest,
    p_oversees_customer_success, p_oversees_demo_engineering, p_oversees_enablement,
    p_oversees_forward_deployed_engineering, p_oversees_implementation_onboarding,
    p_oversees_partnerships_channel_se, p_oversees_professional_services,
    p_oversees_solutions_architecture, p_oversees_solutions_engineering_consulting,
    p_oversees_value_engineering, p_region_north_america, p_region_regional_usa, p_region_global,
    p_region_emea, p_region_apac, p_region_latin_america, p_bucket, p_fit_score, p_tag_note,
    true, case when p_bucket is not null then now() else null end, p_tagged_by, 'Manual', now()
  );
  if p_company_name is not null then
    update public.employment_history set is_current=false where member_id=v_member_id and is_current=true;
    insert into public.employment_history(member_id,company,role,start_date,end_date,is_current,source,created_at)
    values(v_member_id,p_company_name,p_current_role,p_current_start_date,null,true,'Manual',now());
  end if;
  if p_socials is not null then
    for v_social in select * from jsonb_array_elements(p_socials) loop
      insert into public.member_socials(member_id,platform,username,url)
      values(v_member_id,(v_social->>'platform')::social_platform,v_social->>'username',v_social->>'url');
    end loop;
  end if;
  return v_member_id;
end;
$$;

-- The original deletion routines are retained as private implementations.
-- These wrappers provide a database-side service-role check and run as the
-- function owner so trigger disabling and RLS-protected cleanup work safely.
alter function public.delete_member_safely(uuid) rename to delete_member_safely_impl;
alter function public.preview_member_deletion(uuid) rename to preview_member_deletion_impl;
revoke all on function public.delete_member_safely_impl(uuid) from public, anon, authenticated, service_role;
revoke all on function public.preview_member_deletion_impl(uuid) from public, anon, authenticated, service_role;

create function public.delete_member_safely(p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Service-role authorization required';
  end if;
  perform public.delete_member_safely_impl(p_member_id);
end;
$$;

create function public.preview_member_deletion(p_member_id uuid)
returns table (table_name text, row_data jsonb)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Service-role authorization required';
  end if;
  return query
  select * from public.preview_member_deletion_impl(p_member_id);
end;
$$;

-- search_members returns internal classification data. Keep the existing
-- implementation private and expose it only through an admin-checked RPC.
do $$
declare
  v_function_oid oid;
  v_function_oids oid[];
  v_function record;
  v_argument_names text;
  v_argument_count integer;
begin
  select array_agg(p.oid order by p.pronargs desc, p.oid)
    into v_function_oids
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'search_members';

  if coalesce(array_length(v_function_oids, 1), 0) = 0 then
    raise exception 'Expected public.search_members function was not found';
  end if;

  -- Preserve every deployed signature (including legacy and p_bucket variants)
  -- while securing each overload. The OID list is captured before renaming so
  -- newly created wrappers are never mistaken for source implementations.
  foreach v_function_oid in array v_function_oids loop
    select p.oid, p.pronargs, p.proargnames,
           pg_get_function_arguments(p.oid) as arguments,
           pg_get_function_result(p.oid) as result_type,
           pg_get_function_identity_arguments(p.oid) as identity_arguments
      into v_function
      from pg_proc p
     where p.oid = v_function_oid;

    select string_agg(format('%I', input_arg.name), ', ' order by input_arg.ordinality),
           count(*)
      into v_argument_names, v_argument_count
      from unnest(v_function.proargnames)
           with ordinality as input_arg(name, ordinality)
     where input_arg.ordinality <= v_function.pronargs
       and input_arg.name is not null;
    if v_argument_count <> v_function.pronargs then
      raise exception 'public.search_members has unnamed input arguments';
    end if;

    execute format(
      'alter function public.search_members(%s) rename to search_members_admin_impl',
      v_function.identity_arguments
    );
    execute format(
      'revoke all on function public.search_members_admin_impl(%s) from public, anon, authenticated, service_role',
      v_function.identity_arguments
    );
    execute format(
      'create function public.search_members(%s) returns %s language plpgsql stable security definer set search_path = pg_catalog, public, auth as $function$ begin if not public.is_current_user_admin() then raise exception ''Administrator access required''; end if; return query select * from public.search_members_admin_impl(%s); end; $function$',
      v_function.arguments,
      v_function.result_type,
      v_argument_names
    );
  end loop;
end $$;

do $$
declare
  f record;
  v_guarded_oid oid;
begin
  select p.oid into v_guarded_oid
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
      and p.proname = 'create_member_full'
      and p.pronargs = 39
      and p.proargnames[1] = 'p_first_name'
      and p.proargnames[8] = 'p_current_start_date'
      and p.proargnames[19] = 'p_bucket'
      and p.proargnames[38] = 'p_region_latin_america'
      and p.proargnames[39] = 'p_socials'
      and p.prosecdef
      and p.prosrc like '%Administrator access required%';
  if v_guarded_oid is null then
    raise exception 'Expected guarded SECURITY DEFINER create_member_full signature was not found';
  end if;

  for f in select p.proname, p.prosrc, p.oid::regprocedure as signature
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('create_member_full','delete_member_safely','preview_member_deletion')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.signature);
    if f.proname = 'create_member_full' then
      -- Keep every other overload service-role-only. The exact reviewed
      -- SECURITY DEFINER signature above is the only one exposed to admins.
      execute format('grant execute on function %s to service_role', f.signature);
      if f.signature::oid = v_guarded_oid then
        execute format('grant execute on function %s to authenticated', f.signature);
      end if;
    else
      execute format('revoke execute on function %s from authenticated', f.signature);
      execute format('grant execute on function %s to service_role', f.signature);
    end if;
  end loop;
end $$;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as signature
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='search_members'
  loop
    execute format('revoke execute on function %s from public, anon', f.signature);
    execute format('grant execute on function %s to authenticated', f.signature);
  end loop;
end $$;

notify pgrst, 'reload schema';
