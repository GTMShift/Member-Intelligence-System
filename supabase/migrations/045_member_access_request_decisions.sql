-- Turn a signed-in member access request into a real, admin-approved member
-- link. Public Join Us applications remain a separate workflow.

alter table public.member_profile
  add column if not exists oversees_other boolean not null default false,
  add column if not exists oversees_other_text text;

alter table public.members
  drop constraint if exists members_record_source_check;
alter table public.members
  add constraint members_record_source_check
  check (record_source in ('Framer', 'Luma', 'Substack', 'Manual', 'Website'));

alter table public.member_access_requests
  add column if not exists member_id uuid references public.members(id) on delete set null;

alter table public.member_access_requests
  drop constraint if exists member_access_requests_status_check;
update public.member_access_requests set status = 'rejected' where status = 'declined';
alter table public.member_access_requests
  add constraint member_access_requests_status_check
  check (status in ('pending', 'reviewed', 'approved', 'rejected'));

drop index if exists public.member_access_requests_one_pending_per_user;
create unique index member_access_requests_one_pending_per_user
  on public.member_access_requests(auth_user_id)
  where status = 'pending';

-- Decisions must go through the trusted RPC; clients cannot edit request rows.
drop policy if exists member_access_requests_admin_update on public.member_access_requests;
revoke update on public.member_access_requests from authenticated;
revoke all on function public.review_member_access_request(uuid, text, text) from public, anon, authenticated;
drop function if exists public.review_member_access_request(uuid, text, text);

create or replace function public.submit_my_member_access_request(p_data jsonb)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text;
  v_role text;
  v_member_id uuid;
  v_request_id uuid;
  v_allowed_keys text[] := array[
    'first_name', 'last_name', 'linkedin_url', 'phone', 'job_title',
    'current_job_start_date', 'seniority_level', 'company_name', 'team_size',
    'management_layers', 'event_interest', 'address', 'city', 'state_region',
    'zip_code', 'country', 'tshirt_size', 'dietary_restrictions', 'socials',
    'oversees_customer_success', 'oversees_demo_engineering', 'oversees_enablement',
    'oversees_forward_deployed_engineering', 'oversees_implementation_onboarding',
    'oversees_partnerships_channel_se', 'oversees_professional_services',
    'oversees_solutions_architecture', 'oversees_solutions_engineering_consulting',
    'oversees_value_engineering', 'oversees_other', 'oversees_other_text',
    'region_north_america', 'region_regional_usa', 'region_global', 'region_emea',
    'region_apac', 'region_latin_america'
  ];
begin
  if v_user_id is null then
    raise exception 'An authenticated account is required';
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object'
     or octet_length(p_data::text) > 50000
     or (p_data - v_allowed_keys) <> '{}'::jsonb then
    raise exception 'The submitted profile details are invalid';
  end if;

  select p.email, p.role, p.member_id
    into v_email, v_role, v_member_id
    from public.profiles p
   where p.id = v_user_id;
  if not found or v_role not in ('applicant', 'member') or v_member_id is not null then
    raise exception 'Only an unlinked account can submit an access request';
  end if;
  if nullif(btrim(p_data->>'first_name'), '') is null
     or nullif(btrim(p_data->>'last_name'), '') is null then
    raise exception 'First name and last name are required';
  end if;
  if p_data ? 'email' then
    raise exception 'Email is taken from the signed-in account';
  end if;
  if p_data ? 'socials' and jsonb_typeof(p_data->'socials') <> 'array' then
    raise exception 'Social links must be an array';
  end if;

  insert into public.member_access_requests(auth_user_id, email, submitted_data)
  values (v_user_id, coalesce(v_email, ''), p_data)
  on conflict (auth_user_id) where status = 'pending'
  do update set email = excluded.email,
                submitted_data = excluded.submitted_data,
                status = 'pending', reviewed_by = null, reviewed_at = null,
                review_note = null, submitted_at = now()
  returning id into v_request_id;
  return v_request_id;
end;
$$;
revoke all on function public.submit_my_member_access_request(jsonb) from public, anon;
grant execute on function public.submit_my_member_access_request(jsonb) to authenticated;

create or replace function public.decide_member_access_request(
  p_request_id uuid,
  p_decision text,
  p_review_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_request public.member_access_requests%rowtype;
  v_profile public.profiles%rowtype;
  v_data jsonb;
  v_email text;
  v_linkedin text;
  v_email_member_id uuid;
  v_linkedin_member_id uuid;
  v_email_matches integer;
  v_linkedin_matches integer;
  v_member_id uuid;
  v_company_id uuid;
  v_profile_id uuid;
  v_current_count integer;
  v_social jsonb;
  v_socials jsonb;
begin
  if auth.uid() is null or not public.is_current_user_admin() then
    raise exception 'Administrator access required';
  end if;
  if p_decision not in ('approved', 'rejected') then
    raise exception 'Decision must be approved or rejected';
  end if;

  select * into v_request
    from public.member_access_requests
   where id = p_request_id
   for update;
  if not found or v_request.status not in ('pending', 'reviewed') then
    raise exception 'Undecided member access request not found';
  end if;

  if p_decision = 'rejected' then
    update public.member_access_requests
       set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(),
           review_note = nullif(left(btrim(p_review_note), 1000), '')
     where id = p_request_id;
    return null;
  end if;

  select * into v_profile
    from public.profiles
   where id = v_request.auth_user_id
   for update;
  if not found or v_profile.role not in ('applicant', 'member') or v_profile.member_id is not null then
    raise exception 'The account is no longer eligible for member approval';
  end if;
  if lower(btrim(coalesce(v_profile.email, ''))) <> lower(btrim(v_request.email)) then
    raise exception 'The account email changed after this request was submitted';
  end if;

  v_data := v_request.submitted_data;
  v_email := v_profile.email;
  v_linkedin := nullif(btrim(v_data->>'linkedin_url'), '');
  if nullif(btrim(v_data->>'first_name'), '') is null
     or nullif(btrim(v_data->>'last_name'), '') is null
     or v_email is null
     or v_linkedin is null then
    raise exception 'The request is missing required member details';
  end if;

  select count(*) into v_email_matches
    from public.members
   where lower(btrim(email)) = lower(btrim(v_email));
  if v_email_matches = 1 then
    select id into v_email_member_id from public.members
     where lower(btrim(email)) = lower(btrim(v_email)) limit 1;
  end if;
  select count(*) into v_linkedin_matches
    from public.members
   where lower(btrim(linkedin_url)) = lower(btrim(v_linkedin));
  if v_linkedin_matches = 1 then
    select id into v_linkedin_member_id from public.members
     where lower(btrim(linkedin_url)) = lower(btrim(v_linkedin)) limit 1;
  end if;
  if v_email_matches > 1 or v_linkedin_matches > 1 then
    raise exception 'The request matches multiple existing member records; resolve the duplicate first';
  end if;
  if v_email_member_id is not null and v_linkedin_member_id is not null
     and v_email_member_id <> v_linkedin_member_id then
    raise exception 'Email and LinkedIn match different member records; resolve the conflict first';
  end if;
  if v_email_member_id is null and v_linkedin_member_id is not null then
    raise exception 'LinkedIn matches a different email record; verify the account before approval';
  end if;

  v_member_id := v_email_member_id;
  if v_member_id is null then
    select coalesce(jsonb_agg(social), '[]'::jsonb)
      into v_socials
      from (
        select distinct on (value->>'platform') value as social
          from jsonb_array_elements(coalesce(v_data->'socials', '[]'::jsonb))
         where nullif(btrim(value->>'username'), '') is not null
         order by value->>'platform'
      ) deduplicated_socials;
    v_member_id := public.create_member_full(
      btrim(v_data->>'first_name'), btrim(v_data->>'last_name'), v_email,
      v_linkedin, nullif(btrim(v_data->>'phone'), ''),
      nullif(btrim(v_data->>'company_name'), ''), nullif(btrim(v_data->>'job_title'), ''),
      nullif(v_data->>'current_job_start_date', '')::date,
      nullif(v_data->>'team_size', '')::integer,
      nullif(btrim(v_data->>'management_layers'), ''),
      nullif(btrim(v_data->>'event_interest'), ''),
      nullif(btrim(v_data->>'address'), ''), nullif(btrim(v_data->>'city'), ''),
      nullif(btrim(v_data->>'state_region'), ''), nullif(btrim(v_data->>'zip_code'), ''),
      nullif(btrim(v_data->>'country'), ''),
      nullif(v_data->>'tshirt_size', '')::public.tshirt_size,
      nullif(btrim(v_data->>'dietary_restrictions'), ''),
      null::public.icp_bucket, null::integer, null::text, null::uuid,
      coalesce((v_data->>'oversees_customer_success')::boolean, false),
      coalesce((v_data->>'oversees_demo_engineering')::boolean, false),
      coalesce((v_data->>'oversees_enablement')::boolean, false),
      coalesce((v_data->>'oversees_forward_deployed_engineering')::boolean, false),
      coalesce((v_data->>'oversees_implementation_onboarding')::boolean, false),
      coalesce((v_data->>'oversees_partnerships_channel_se')::boolean, false),
      coalesce((v_data->>'oversees_professional_services')::boolean, false),
      coalesce((v_data->>'oversees_solutions_architecture')::boolean, false),
      coalesce((v_data->>'oversees_solutions_engineering_consulting')::boolean, false),
      coalesce((v_data->>'oversees_value_engineering')::boolean, false),
      coalesce((v_data->>'region_north_america')::boolean, false),
      coalesce((v_data->>'region_regional_usa')::boolean, false),
      coalesce((v_data->>'region_global')::boolean, false),
      coalesce((v_data->>'region_emea')::boolean, false),
      coalesce((v_data->>'region_apac')::boolean, false),
      coalesce((v_data->>'region_latin_america')::boolean, false),
      v_socials
    );
    update public.members set record_source = 'Website' where id = v_member_id;
    update public.member_profile
       set signup_source = 'Website', tagged_manually = false, tagged_at = null, tagged_by = null,
           seniority_level = nullif(btrim(v_data->>'seniority_level'), ''),
           oversees_other = coalesce((v_data->>'oversees_other')::boolean, false),
           oversees_other_text = nullif(btrim(v_data->>'oversees_other_text'), '')
     where member_id = v_member_id;
  else
    select count(*) into v_email_matches
      from public.profiles p
     where p.member_id = v_member_id and p.id <> v_request.auth_user_id;
    if v_email_matches > 0 then
      raise exception 'This member record is already linked to another account';
    end if;

    -- Reuse matching records without overwriting existing non-empty profile data.
    update public.members
       set phone = coalesce(phone, nullif(btrim(v_data->>'phone'), '')),
           last_updated = now()
     where id = v_member_id;
    select id into v_company_id from public.companies
     where lower(name) = lower(btrim(v_data->>'company_name')) limit 1;
    if v_company_id is null and nullif(btrim(v_data->>'company_name'), '') is not null then
      insert into public.companies(name) values (btrim(v_data->>'company_name')) returning id into v_company_id;
    end if;
    select id into v_profile_id from public.member_profile
     where member_id = v_member_id
     order by updated_at desc nulls last, id desc limit 1;
    if v_profile_id is null then
      insert into public.member_profile(
      member_id, company_id, team_size, address, city, state_region, zip_code, country,
      tshirt_size, dietary_restrictions, management_layers, event_interest, signup_source,
      seniority_level, oversees_other, oversees_other_text,
      oversees_customer_success, oversees_demo_engineering, oversees_enablement,
      oversees_forward_deployed_engineering, oversees_implementation_onboarding,
      oversees_partnerships_channel_se, oversees_professional_services,
      oversees_solutions_architecture, oversees_solutions_engineering_consulting,
      oversees_value_engineering, region_north_america, region_regional_usa, region_global,
      region_emea, region_apac, region_latin_america, updated_at
      ) values (
      v_member_id, v_company_id, nullif(v_data->>'team_size', '')::integer,
      nullif(btrim(v_data->>'address'), ''), nullif(btrim(v_data->>'city'), ''),
      nullif(btrim(v_data->>'state_region'), ''), nullif(btrim(v_data->>'zip_code'), ''),
      nullif(btrim(v_data->>'country'), ''), nullif(v_data->>'tshirt_size', '')::public.tshirt_size,
      nullif(btrim(v_data->>'dietary_restrictions'), ''), nullif(btrim(v_data->>'management_layers'), ''),
      nullif(btrim(v_data->>'event_interest'), ''), 'Website',
      nullif(btrim(v_data->>'seniority_level'), ''), coalesce((v_data->>'oversees_other')::boolean, false),
      nullif(btrim(v_data->>'oversees_other_text'), ''),
      coalesce((v_data->>'oversees_customer_success')::boolean, false),
      coalesce((v_data->>'oversees_demo_engineering')::boolean, false),
      coalesce((v_data->>'oversees_enablement')::boolean, false),
      coalesce((v_data->>'oversees_forward_deployed_engineering')::boolean, false),
      coalesce((v_data->>'oversees_implementation_onboarding')::boolean, false),
      coalesce((v_data->>'oversees_partnerships_channel_se')::boolean, false),
      coalesce((v_data->>'oversees_professional_services')::boolean, false),
      coalesce((v_data->>'oversees_solutions_architecture')::boolean, false),
      coalesce((v_data->>'oversees_solutions_engineering_consulting')::boolean, false),
      coalesce((v_data->>'oversees_value_engineering')::boolean, false),
      coalesce((v_data->>'region_north_america')::boolean, false),
      coalesce((v_data->>'region_regional_usa')::boolean, false),
      coalesce((v_data->>'region_global')::boolean, false), coalesce((v_data->>'region_emea')::boolean, false),
      coalesce((v_data->>'region_apac')::boolean, false), coalesce((v_data->>'region_latin_america')::boolean, false), now()
      );
    else
      update public.member_profile set
        company_id = coalesce(company_id, v_company_id),
        team_size = coalesce(team_size, nullif(v_data->>'team_size', '')::integer),
        address = coalesce(address, nullif(btrim(v_data->>'address'), '')),
        city = coalesce(city, nullif(btrim(v_data->>'city'), '')),
        state_region = coalesce(state_region, nullif(btrim(v_data->>'state_region'), '')),
        zip_code = coalesce(zip_code, nullif(btrim(v_data->>'zip_code'), '')),
        country = coalesce(country, nullif(btrim(v_data->>'country'), '')),
        tshirt_size = coalesce(tshirt_size, nullif(v_data->>'tshirt_size', '')::public.tshirt_size),
        dietary_restrictions = coalesce(dietary_restrictions, nullif(btrim(v_data->>'dietary_restrictions'), '')),
        management_layers = coalesce(management_layers, nullif(btrim(v_data->>'management_layers'), '')),
        event_interest = coalesce(event_interest, nullif(btrim(v_data->>'event_interest'), '')),
        seniority_level = coalesce(seniority_level, nullif(btrim(v_data->>'seniority_level'), '')),
        signup_source = coalesce(signup_source, 'Website'),
        oversees_other = oversees_other or coalesce((v_data->>'oversees_other')::boolean, false),
        oversees_other_text = coalesce(oversees_other_text, nullif(btrim(v_data->>'oversees_other_text'), '')),
        oversees_customer_success = oversees_customer_success or coalesce((v_data->>'oversees_customer_success')::boolean, false),
        oversees_demo_engineering = oversees_demo_engineering or coalesce((v_data->>'oversees_demo_engineering')::boolean, false),
        oversees_enablement = oversees_enablement or coalesce((v_data->>'oversees_enablement')::boolean, false),
        oversees_forward_deployed_engineering = oversees_forward_deployed_engineering or coalesce((v_data->>'oversees_forward_deployed_engineering')::boolean, false),
        oversees_implementation_onboarding = oversees_implementation_onboarding or coalesce((v_data->>'oversees_implementation_onboarding')::boolean, false),
        oversees_partnerships_channel_se = oversees_partnerships_channel_se or coalesce((v_data->>'oversees_partnerships_channel_se')::boolean, false),
        oversees_professional_services = oversees_professional_services or coalesce((v_data->>'oversees_professional_services')::boolean, false),
        oversees_solutions_architecture = oversees_solutions_architecture or coalesce((v_data->>'oversees_solutions_architecture')::boolean, false),
        oversees_solutions_engineering_consulting = oversees_solutions_engineering_consulting or coalesce((v_data->>'oversees_solutions_engineering_consulting')::boolean, false),
        oversees_value_engineering = oversees_value_engineering or coalesce((v_data->>'oversees_value_engineering')::boolean, false),
        region_north_america = region_north_america or coalesce((v_data->>'region_north_america')::boolean, false),
        region_regional_usa = region_regional_usa or coalesce((v_data->>'region_regional_usa')::boolean, false),
        region_global = region_global or coalesce((v_data->>'region_global')::boolean, false),
        region_emea = region_emea or coalesce((v_data->>'region_emea')::boolean, false),
        region_apac = region_apac or coalesce((v_data->>'region_apac')::boolean, false),
        region_latin_america = region_latin_america or coalesce((v_data->>'region_latin_america')::boolean, false),
        updated_at = now()
       where id = v_profile_id;
    end if;

    select count(*) into v_current_count from public.employment_history
     where member_id = v_member_id and is_current;
    if v_current_count = 0 and nullif(btrim(v_data->>'company_name'), '') is not null
       and nullif(btrim(v_data->>'job_title'), '') is not null then
      insert into public.employment_history(member_id, company, role, start_date, is_current, source)
      values (v_member_id, btrim(v_data->>'company_name'), btrim(v_data->>'job_title'),
              nullif(v_data->>'current_job_start_date', '')::date, true, 'Website');
    end if;
    for v_social in select value from jsonb_array_elements(coalesce(v_data->'socials', '[]'::jsonb)) loop
      insert into public.member_socials(member_id, platform, username, url)
      values (v_member_id, (v_social->>'platform')::public.social_platform,
              nullif(btrim(v_social->>'username'), ''), nullif(btrim(v_social->>'url'), ''))
      on conflict (member_id, platform) do nothing;
    end loop;
  end if;

  update public.profiles set member_id = v_member_id, role = 'member'
   where id = v_request.auth_user_id;
  update public.member_access_requests
     set status = 'approved', member_id = v_member_id, reviewed_by = auth.uid(),
         reviewed_at = now(), review_note = nullif(left(btrim(p_review_note), 1000), '')
   where id = p_request_id;
  return v_member_id;
end;
$$;
revoke all on function public.decide_member_access_request(uuid, text, text) from public, anon;
grant execute on function public.decide_member_access_request(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';
