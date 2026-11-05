-- Local replay baseline for the legacy public Join Us form table.
--
-- Migration 034 previously renamed this externally-created table without a
-- checked-in creation migration. This minimal IF NOT EXISTS baseline supplies
-- the columns consumed by migrations 034-035 on a fresh local replay. It is a
-- no-op when the existing form_responses table is present. Reconcile the full
-- form integration schema before applying migrations to a shared project.
create table if not exists public.form_responses (
  id uuid primary key default gen_random_uuid(),
  first_name text,
  last_name text,
  email_address text,
  linkedin text,
  phone_number text,
  company text,
  job_title text,
  created_at timestamptz not null default now()
);
