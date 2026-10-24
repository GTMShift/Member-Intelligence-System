-- Local replay baseline for the OTR form table.
--
-- The hosted table predates the checked-in migration history and is created by
-- the external form integration. A fresh local replay needs its original base
-- columns before migration 015 can add the team/region flags. CREATE TABLE IF
-- NOT EXISTS leaves an existing hosted table and its data untouched. Keep this
-- baseline limited to columns required by the subsequent checked-in migrations;
-- reconcile the full external-form schema before applying migrations remotely.
create table if not exists public.otr_applications (
  id uuid primary key default gen_random_uuid(),
  first_name text,
  last_name text,
  email text,
  linkedin text,
  phone_number text,
  teams_you_oversee text[] default '{}',
  geographic_scope text[] default '{}',
  created_at timestamptz not null default now()
);
