-- 015_team_region_flags.sql
--
-- Converts the "teams you oversee" and "region" multi-select fields from
-- array columns into individual boolean columns (one per option), so they
-- can be filtered/searched with plain WHERE clauses instead of array
-- containment queries. Applied to both member_profile (a one-time cleaned
-- data snapshot) and otr_applications (fed by a live Framer form).

-- ============================================================
-- 1. member_profile: add the new boolean columns
-- ============================================================
alter table member_profile
  add column if not exists oversees_customer_success boolean not null default false,
  add column if not exists oversees_demo_engineering boolean not null default false,
  add column if not exists oversees_enablement boolean not null default false,
  add column if not exists oversees_forward_deployed_engineering boolean not null default false,
  add column if not exists oversees_implementation_onboarding boolean not null default false,
  add column if not exists oversees_partnerships_channel_se boolean not null default false,
  add column if not exists oversees_professional_services boolean not null default false,
  add column if not exists oversees_solutions_architecture boolean not null default false,
  add column if not exists oversees_solutions_engineering_consulting boolean not null default false,
  add column if not exists oversees_value_engineering boolean not null default false,
  add column if not exists region_apac boolean not null default false,
  add column if not exists region_emea boolean not null default false,
  add column if not exists region_global boolean not null default false,
  add column if not exists region_latin_america boolean not null default false,
  add column if not exists region_north_america boolean not null default false,
  add column if not exists region_regional_usa boolean not null default false;

-- ============================================================
-- 2. member_profile: backfill from the existing array columns
--    (one-time snapshot data, so a direct UPDATE is sufficient —
--    no live writes to worry about keeping in sync going forward)
-- ============================================================
update member_profile
set
  oversees_customer_success = coalesce('Customer Success' = any(teams_you_oversee), false),
  oversees_demo_engineering = coalesce('Demo engineering' = any(teams_you_oversee), false),
  oversees_enablement = coalesce('Enablement' = any(teams_you_oversee), false),
  oversees_forward_deployed_engineering = coalesce('Forward Deployed Engineering' = any(teams_you_oversee), false),
  oversees_implementation_onboarding = coalesce('Implementation / Onboarding' = any(teams_you_oversee), false),
  oversees_partnerships_channel_se = coalesce('Partnerships / Channel SE' = any(teams_you_oversee), false),
  oversees_professional_services = coalesce('Professional Services' = any(teams_you_oversee), false),
  oversees_solutions_architecture = coalesce('Solutions Architecture' = any(teams_you_oversee), false),
  oversees_solutions_engineering_consulting = coalesce('Solutions Engineering/Consulting' = any(teams_you_oversee), false),
  oversees_value_engineering = coalesce('Value Engineering' = any(teams_you_oversee), false),
  region_apac = coalesce('APAC' = any(regions), false),
  region_emea = coalesce('EMEA' = any(regions), false),
  region_global = coalesce('Global' = any(regions), false),
  region_latin_america = coalesce('Latin America' = any(regions), false),
  region_north_america = coalesce('North America' = any(regions), false),
  region_regional_usa = coalesce('Regional USA' = any(regions), false);

-- ============================================================
-- 3. member_profile: drop the old array columns
--    (safe to drop here — data verified matching before this file
--    was written, and this table is a static one-time import, not
--    written to by any live external system)
-- ============================================================
alter table member_profile
  drop column if exists teams_you_oversee,
  drop column if exists regions;

-- ============================================================
-- 4. otr_applications: add the same boolean columns
--    (note: this table's region field is named geographic_scope,
--    not regions, unlike member_profile)
-- ============================================================
alter table otr_applications
  add column if not exists oversees_customer_success boolean not null default false,
  add column if not exists oversees_demo_engineering boolean not null default false,
  add column if not exists oversees_enablement boolean not null default false,
  add column if not exists oversees_forward_deployed_engineering boolean not null default false,
  add column if not exists oversees_implementation_onboarding boolean not null default false,
  add column if not exists oversees_partnerships_channel_se boolean not null default false,
  add column if not exists oversees_professional_services boolean not null default false,
  add column if not exists oversees_solutions_architecture boolean not null default false,
  add column if not exists oversees_solutions_engineering_consulting boolean not null default false,
  add column if not exists oversees_value_engineering boolean not null default false,
  add column if not exists region_apac boolean not null default false,
  add column if not exists region_emea boolean not null default false,
  add column if not exists region_global boolean not null default false,
  add column if not exists region_latin_america boolean not null default false,
  add column if not exists region_north_america boolean not null default false,
  add column if not exists region_regional_usa boolean not null default false;

-- ============================================================
-- 5. otr_applications: backfill existing rows
-- ============================================================
update otr_applications
set
  oversees_customer_success = coalesce('Customer Success' = any(teams_you_oversee), false),
  oversees_demo_engineering = coalesce('Demo engineering' = any(teams_you_oversee), false),
  oversees_enablement = coalesce('Enablement' = any(teams_you_oversee), false),
  oversees_forward_deployed_engineering = coalesce('Forward Deployed Engineering' = any(teams_you_oversee), false),
  oversees_implementation_onboarding = coalesce('Implementation / Onboarding' = any(teams_you_oversee), false),
  oversees_partnerships_channel_se = coalesce('Partnerships / Channel SE' = any(teams_you_oversee), false),
  oversees_professional_services = coalesce('Professional Services' = any(teams_you_oversee), false),
  oversees_solutions_architecture = coalesce('Solutions Architecture' = any(teams_you_oversee), false),
  oversees_solutions_engineering_consulting = coalesce('Solutions Engineering/Consulting' = any(teams_you_oversee), false),
  oversees_value_engineering = coalesce('Value Engineering' = any(teams_you_oversee), false),
  region_apac = coalesce('APAC' = any(geographic_scope), false),
  region_emea = coalesce('EMEA' = any(geographic_scope), false),
  region_global = coalesce('Global' = any(geographic_scope), false),
  region_latin_america = coalesce('Latin America' = any(geographic_scope), false),
  region_north_america = coalesce('North America' = any(geographic_scope), false),
  region_regional_usa = coalesce('Regional USA' = any(geographic_scope), false);

-- ============================================================
-- 6. otr_applications: auto-sync trigger
--    Unlike member_profile, this table is fed by a LIVE Framer form
--    that still writes to teams_you_oversee/geographic_scope. Rather
--    than modifying the Framer Code Override, this trigger keeps the
--    boolean columns automatically in sync on every insert/update, so
--    the array columns must stay in place indefinitely.
-- ============================================================
create or replace function sync_otr_team_region_flags()
returns trigger as $$
begin
  new.oversees_customer_success := coalesce('Customer Success' = any(new.teams_you_oversee), false);
  new.oversees_demo_engineering := coalesce('Demo engineering' = any(new.teams_you_oversee), false);
  new.oversees_enablement := coalesce('Enablement' = any(new.teams_you_oversee), false);
  new.oversees_forward_deployed_engineering := coalesce('Forward Deployed Engineering' = any(new.teams_you_oversee), false);
  new.oversees_implementation_onboarding := coalesce('Implementation / Onboarding' = any(new.teams_you_oversee), false);
  new.oversees_partnerships_channel_se := coalesce('Partnerships / Channel SE' = any(new.teams_you_oversee), false);
  new.oversees_professional_services := coalesce('Professional Services' = any(new.teams_you_oversee), false);
  new.oversees_solutions_architecture := coalesce('Solutions Architecture' = any(new.teams_you_oversee), false);
  new.oversees_solutions_engineering_consulting := coalesce('Solutions Engineering/Consulting' = any(new.teams_you_oversee), false);
  new.oversees_value_engineering := coalesce('Value Engineering' = any(new.teams_you_oversee), false);
  new.region_apac := coalesce('APAC' = any(new.geographic_scope), false);
  new.region_emea := coalesce('EMEA' = any(new.geographic_scope), false);
  new.region_global := coalesce('Global' = any(new.geographic_scope), false);
  new.region_latin_america := coalesce('Latin America' = any(new.geographic_scope), false);
  new.region_north_america := coalesce('North America' = any(new.geographic_scope), false);
  new.region_regional_usa := coalesce('Regional USA' = any(new.geographic_scope), false);
  return new;
end;
$$ language plpgsql;

create trigger trg_sync_otr_team_region_flags
before insert or update of teams_you_oversee, geographic_scope on otr_applications
for each row
execute function sync_otr_team_region_flags();