-- 026_server_side_member_search.sql
--
-- Moves member search/filter/sort/pagination entirely into Postgres via a
-- single RPC function, replacing the previous "fetch everything, filter in
-- JS" approach in membersApi.ts. Includes the indexes needed to keep this
-- fast as the member count grows well beyond current scale.

-- pg_trgm enables fast partial-text (ILIKE '%...%') matching via GIN
-- indexes — needed for the free-text search box, which matches partial
-- substrings anywhere in a name/email/company/role, not just prefixes.
create extension if not exists pg_trgm;

-- Text search indexes
create index if not exists idx_members_last_name_trgm on members using gin (last_name gin_trgm_ops);
create index if not exists idx_members_first_name_trgm on members using gin (first_name gin_trgm_ops);
create index if not exists idx_members_email_trgm on members using gin (email gin_trgm_ops);
create index if not exists idx_companies_name_trgm on companies using gin (name gin_trgm_ops);
create index if not exists idx_employment_history_role_trgm on employment_history using gin (role gin_trgm_ops);

-- Sort indexes
create index if not exists idx_members_last_name on members (last_name);
create index if not exists idx_members_first_name on members (first_name);
create index if not exists idx_members_created_at on members (created_at);
create index if not exists idx_members_last_updated on members (last_updated);

-- Filter indexes
create index if not exists idx_member_profile_icp on member_profile (icp);
create index if not exists idx_member_profile_state_region on member_profile (state_region);
create index if not exists idx_member_profile_seniority_level on member_profile (seniority_level);
create index if not exists idx_member_profile_signup_source on member_profile (signup_source);
create index if not exists idx_member_profile_team_size on member_profile (team_size);
create index if not exists idx_member_profile_metro_area_id on member_profile (metro_area_id);
create index if not exists idx_member_profile_company_id on member_profile (company_id);
create index if not exists idx_member_profile_tags on member_profile using gin (tags);
create index if not exists idx_companies_industry on companies (industry);
create index if not exists idx_employment_history_member_current on employment_history (member_id, is_current);

-- The actual search function. Takes every filter/sort/pagination param the
-- frontend currently supports, does all filtering/sorting in SQL, and
-- returns exactly one page of lightweight result rows plus the total
-- matching count (via a window function, so no second round trip is
-- needed for pagination).
create or replace function search_members(
  p_q text default null,
  p_icp text default null,
  p_metro_area_name text default null,
  p_state text default null,
  p_industry text default null,
  p_seniority text default null,
  p_source text default null,
  p_team_size text default null,
  p_tag text default null,
  p_sort text default 'last_name_asc',
  p_page int default 1,
  p_limit int default 50
)
returns table (
  total bigint,
  id uuid,
  first_name text,
  last_name text,
  email text,
  company_id uuid,
  company_name text,
  current_role_title text,
  metro_area_name text,
  state_region text,
  icp text,
  last_updated timestamptz
)
language plpgsql
stable
as $$
declare
  v_offset int := (greatest(p_page, 1) - 1) * greatest(p_limit, 1);
  v_team_min int;
  v_team_max int;
begin
  case p_team_size
    when '1-10' then v_team_min := 1; v_team_max := 10;
    when '11-50' then v_team_min := 11; v_team_max := 50;
    when '51-200' then v_team_min := 51; v_team_max := 200;
    when '201-500' then v_team_min := 201; v_team_max := 500;
    when '501-1000' then v_team_min := 501; v_team_max := 1000;
    when '1000+' then v_team_min := 1001; v_team_max := 2147483647;
    else v_team_min := null; v_team_max := null;
  end case;

  return query
  with base as (
    select
      m.id,
      m.first_name,
      m.last_name,
      m.email,
      m.created_at,
      m.last_updated,
      mp.company_id,
      c.name as company_name,
      c.industry,
      ma.name as metro_area_name,
      mp.state_region,
      mp.icp,
      mp.seniority_level,
      mp.signup_source,
      mp.team_size,
      mp.tags,
      eh.role as current_role_title
    from members m
    left join member_profile mp on mp.member_id = m.id
    left join companies c on c.id = mp.company_id
    left join metro_areas ma on ma.id = mp.metro_area_id
    left join employment_history eh on eh.member_id = m.id and eh.is_current = true
  ),
  filtered as (
    select * from base b
    where
      (p_q is null or p_q = '' or (
        b.first_name ilike '%' || p_q || '%'
        or b.last_name ilike '%' || p_q || '%'
        or (b.first_name || ' ' || b.last_name) ilike '%' || p_q || '%'
        or b.email ilike '%' || p_q || '%'
        or b.company_name ilike '%' || p_q || '%'
        or b.current_role_title ilike '%' || p_q || '%'
      ))
      and (
        p_icp is null
        or (p_icp = 'NONE' and b.icp is null)
        or (p_icp != 'NONE' and b.icp = p_icp)
      )
      and (p_metro_area_name is null or b.metro_area_name = p_metro_area_name)
      and (p_state is null or b.state_region = p_state)
      and (p_industry is null or b.industry = p_industry)
      and (p_seniority is null or b.seniority_level = p_seniority)
      and (p_source is null or b.signup_source = p_source)
      and (
        v_team_min is null
        or (b.team_size is not null and b.team_size >= v_team_min and b.team_size <= v_team_max)
      )
      and (p_tag is null or b.tags @> array[p_tag])
  ),
  counted as (
    select count(*) over () as total_count, f.*
    from filtered f
  )
  select
    coalesce((select total_count from counted limit 1), 0) as total,
    c.id, c.first_name, c.last_name, c.email, c.company_id, c.company_name,
    c.current_role_title, c.metro_area_name, c.state_region, c.icp, c.last_updated
  from counted c
  order by
    case when p_sort = 'last_name_asc' or p_sort is null then c.last_name end asc,
    case when p_sort = 'last_name_asc' or p_sort is null then c.first_name end asc,
    case when p_sort = 'last_name_desc' then c.last_name end desc,
    case when p_sort = 'last_name_desc' then c.first_name end desc,
    case when p_sort = 'first_name_asc' then c.first_name end asc,
    case when p_sort = 'first_name_asc' then c.last_name end asc,
    case when p_sort = 'first_name_desc' then c.first_name end desc,
    case when p_sort = 'first_name_desc' then c.last_name end desc,
    case when p_sort = 'signup_newest' then c.created_at end desc,
    case when p_sort = 'signup_oldest' then c.created_at end asc,
    case when p_sort = 'updated_newest' then c.last_updated end desc,
    case when p_sort = 'updated_oldest' then c.last_updated end asc
  limit p_limit offset v_offset;
end;
$$;