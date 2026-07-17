-- 018_icp_bucket_socials_and_create_member_fn.sql
 
-- ============================================================
-- icp_bucket enum
-- ============================================================
create type icp_bucket as enum (
  'primary_icp',
  'secondary_icp',
  'watchlist',
  'between_jobs',
  'consultant',
  'partner_sponsor',
  'icp_no',
  'manual_review'
);
 
alter table member_profile
  alter column bucket type icp_bucket
  using bucket::icp_bucket;
 
-- ============================================================
-- social_platform enum and member_socials table
-- ============================================================
create type social_platform as enum (
  'Twitter/X',
  'Instagram',
  'TikTok',
  'YouTube',
  'Facebook'
);
 
create table member_socials (
  id          uuid default gen_random_uuid() primary key,
  member_id   uuid references members(id) on delete cascade,
  platform    social_platform not null,
  username    text not null,
  url         text,
  created_at  timestamptz default now(),
  unique (member_id, platform)
);
 
-- ============================================================
-- RLS for member_socials
-- ============================================================
alter table member_socials enable row level security;
 
create policy "Admins can insert socials"
on member_socials for insert
with check (
  exists (select 1 from profiles where id = auth.uid() and role = 'admin')
);
 
create policy "Admins can read socials"
on member_socials for select
using (
  exists (select 1 from profiles where id = auth.uid() and role = 'admin')
);
 
create policy "Members can read own socials"
on member_socials for select
using (
  member_id = auth.uid()
);
 
-- ============================================================
-- create_member_full transaction function
-- Wraps all member creation inserts in a single transaction.
-- If any step fails, everything rolls back automatically.
-- ============================================================
create or replace function create_member_full(
  p_first_name text,
  p_last_name text,
  p_email text,
  p_linkedin_url text,
  p_phone text,
  p_company_name text,
  p_current_role text,
  p_current_start_date date,
  p_team_size integer,
  p_management_layers text,
  p_event_interest text,
  p_address text,
  p_city text,
  p_state_region text,
  p_zip_code text,
  p_country text,
  p_tshirt_size tshirt_size,
  p_dietary_restrictions text,
  p_bucket icp_bucket,
  p_fit_score integer,
  p_tag_note text,
  p_tagged_by uuid,
  p_oversees_customer_success boolean,
  p_oversees_demo_engineering boolean,
  p_oversees_enablement boolean,
  p_oversees_forward_deployed_engineering boolean,
  p_oversees_implementation_onboarding boolean,
  p_oversees_partnerships_channel_se boolean,
  p_oversees_professional_services boolean,
  p_oversees_solutions_architecture boolean,
  p_oversees_solutions_engineering_consulting boolean,
  p_oversees_value_engineering boolean,
  p_region_north_america boolean,
  p_region_regional_usa boolean,
  p_region_global boolean,
  p_region_emea boolean,
  p_region_apac boolean,
  p_region_latin_america boolean,
  p_socials jsonb
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_member_id uuid;
  v_company_id uuid;
  v_social jsonb;
begin
  -- step 1: insert member
  insert into members (
    first_name, last_name, email, linkedin_url, phone,
    record_source, created_at, last_updated
  )
  values (
    p_first_name, p_last_name, p_email, p_linkedin_url, p_phone,
    'Manual', now(), now()
  )
  returning id into v_member_id;
 
  -- step 2: resolve or create company
  if p_company_name is not null then
    select id into v_company_id
    from companies
    where lower(name) = lower(p_company_name)
    limit 1;
 
    if v_company_id is null then
      insert into companies (name, created_at, updated_at)
      values (p_company_name, now(), now())
      returning id into v_company_id;
    end if;
  end if;
 
  -- step 3: insert member_profile
  insert into member_profile (
    member_id, company_id, team_size,
    address, city, state_region, zip_code, country,
    tshirt_size, dietary_restrictions, management_layers, event_interest,
    oversees_customer_success, oversees_demo_engineering, oversees_enablement,
    oversees_forward_deployed_engineering, oversees_implementation_onboarding,
    oversees_partnerships_channel_se, oversees_professional_services,
    oversees_solutions_architecture, oversees_solutions_engineering_consulting,
    oversees_value_engineering, region_north_america, region_regional_usa,
    region_global, region_emea, region_apac, region_latin_america,
    bucket, fit_score, tag_note, tagged_manually, tagged_at, tagged_by,
    signup_source, updated_at
  )
  values (
    v_member_id, v_company_id, p_team_size,
    p_address, p_city, p_state_region, p_zip_code, p_country,
    p_tshirt_size, p_dietary_restrictions, p_management_layers, p_event_interest,
    p_oversees_customer_success, p_oversees_demo_engineering, p_oversees_enablement,
    p_oversees_forward_deployed_engineering, p_oversees_implementation_onboarding,
    p_oversees_partnerships_channel_se, p_oversees_professional_services,
    p_oversees_solutions_architecture, p_oversees_solutions_engineering_consulting,
    p_oversees_value_engineering, p_region_north_america, p_region_regional_usa,
    p_region_global, p_region_emea, p_region_apac, p_region_latin_america,
    p_bucket, p_fit_score, p_tag_note, true,
    case when p_bucket is not null then now() else null end,
    p_tagged_by, 'Manual', now()
  );
 
  -- step 4: insert employment history
  if p_company_name is not null then
    update employment_history
    set is_current = false
    where member_id = v_member_id and is_current = true;
 
    insert into employment_history (
      member_id, company, role, start_date,
      end_date, is_current, source, created_at
    )
    values (
      v_member_id, p_company_name, p_current_role,
      p_current_start_date, null, true, 'Manual', now()
    );
  end if;
 
  -- step 5: insert socials
  if p_socials is not null then
    for v_social in select * from jsonb_array_elements(p_socials)
    loop
      insert into member_socials (member_id, platform, username, url)
      values (
        v_member_id,
        (v_social->>'platform')::social_platform,
        v_social->>'username',
        v_social->>'url'
      );
    end loop;
  end if;
 
  return v_member_id;
 
exception when others then
  raise;
end;
$$;
 