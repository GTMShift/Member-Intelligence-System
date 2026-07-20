-- 016_notifications_and_duplicate_flags.sql

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in (
    'duplicate_detected', 'job_change', 'new_signup',
    'enrichment_complete', 'enrichment_failed', 'profile_updated'
  )),
  title text not null,
  body text not null,
  member_id uuid references members(id) on delete set null,
  member_name text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_is_read on notifications(is_read);
create index if not exists idx_notifications_created_at on notifications(created_at desc);

create table if not exists duplicate_flags (
  id uuid primary key default gen_random_uuid(),
  incoming_first_name text not null,
  incoming_last_name text not null,
  incoming_email text not null,
  incoming_linkedin_url text,
  incoming_phone text,
  incoming_current_role text,
  existing_member_id uuid not null references members(id) on delete cascade,
  matched_on text not null check (matched_on in ('email', 'linkedin_url', 'phone')),
  status text not null default 'pending' check (status in ('pending', 'dismissed')),
  created_at timestamptz not null default now(),
  dismissed_at timestamptz,
  dismissed_by uuid references profiles(id)
);

create index if not exists idx_duplicate_flags_status on duplicate_flags(status);