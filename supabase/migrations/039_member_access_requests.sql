-- Store self-submitted member details for trusted review without creating or
-- linking a live member record from the browser.
create table if not exists public.member_access_requests (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  submitted_data jsonb not null check (jsonb_typeof(submitted_data) = 'object'),
  status text not null default 'pending'
    check (status in ('pending', 'reviewed', 'declined')),
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  review_note text,
  constraint member_access_requests_review_state check (
    (status = 'pending' and reviewed_by is null and reviewed_at is null)
    or (status <> 'pending' and reviewed_by is not null and reviewed_at is not null)
  ),
  constraint member_access_requests_data_size check (octet_length(submitted_data::text) <= 50000)
);

create unique index if not exists member_access_requests_one_pending_per_user
  on public.member_access_requests(auth_user_id) where status = 'pending';
create index if not exists member_access_requests_status_submitted_at
  on public.member_access_requests(status, submitted_at desc);

alter table public.member_access_requests enable row level security;
revoke all on public.member_access_requests from public, anon, authenticated;
grant select on public.member_access_requests to authenticated;

drop policy if exists member_access_requests_owner_or_admin_read on public.member_access_requests;
create policy member_access_requests_owner_or_admin_read
  on public.member_access_requests for select to authenticated
  using (auth_user_id = auth.uid() or public.is_current_user_admin());

drop policy if exists member_access_requests_admin_update on public.member_access_requests;
create policy member_access_requests_admin_update
  on public.member_access_requests for update to authenticated
  using (public.is_current_user_admin())
  with check (public.is_current_user_admin());
grant update on public.member_access_requests to authenticated;

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
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'The submitted profile details are invalid';
  end if;
  if octet_length(p_data::text) > 50000 or (p_data - v_allowed_keys) <> '{}'::jsonb then
    raise exception 'The submitted profile details are invalid';
  end if;

  select p.email, p.role, p.member_id
    into v_email, v_role, v_member_id
    from public.profiles p
   where p.id = v_user_id;
  if not found or v_role <> 'member' or v_member_id is not null then
    raise exception 'Only an unlinked member account can submit an access request';
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
                submitted_at = now()
  returning id into v_request_id;

  return v_request_id;
end;
$$;
revoke all on function public.submit_my_member_access_request(jsonb) from public, anon;
grant execute on function public.submit_my_member_access_request(jsonb) to authenticated;

create or replace function public.review_member_access_request(
  p_request_id uuid,
  p_status text,
  p_review_note text default null
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if auth.uid() is null or not public.is_current_user_admin() then
    raise exception 'Administrator access required';
  end if;
  if p_status is null or p_status not in ('reviewed', 'declined') then
    raise exception 'Review status must be reviewed or declined';
  end if;

  update public.member_access_requests
     set status = p_status,
         reviewed_by = auth.uid(),
         reviewed_at = now(),
         review_note = nullif(left(btrim(p_review_note), 1000), '')
   where id = p_request_id and status = 'pending';
  if not found then
    raise exception 'Pending access request not found';
  end if;
  return true;
end;
$$;
revoke all on function public.review_member_access_request(uuid, text, text) from public, anon;
grant execute on function public.review_member_access_request(uuid, text, text) to authenticated;

revoke truncate on public.member_access_requests from public, anon, authenticated;
notify pgrst, 'reload schema';
