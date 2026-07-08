-- 006_substack_subscribers_and_engagement.sql

-- Core subscriber identity/status table
create table if not exists substack_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text,
  subscription_type text,          -- 'Stripe plan' / 'Type' column from CSV
  status text not null default 'active', -- 'active' | 'unsubscribed'
  member_id uuid references members(id) on delete set null,
  start_date date,
  paid_upgrade_date date,
  cancel_date date,
  expiration_date date,
  country text,
  state_province text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unsubscribed_at timestamptz,
  raw_csv_row jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_substack_subscribers_email on substack_subscribers(email);
create index if not exists idx_substack_subscribers_member_id on substack_subscribers(member_id);
create index if not exists idx_substack_subscribers_status on substack_subscribers(status);

-- Tracks each CSV import run
create table if not exists substack_import_runs (
  id uuid primary key default gen_random_uuid(),
  filename text,
  imported_by uuid references profiles(id),
  total_rows integer not null default 0,
  new_count integer not null default 0,
  reactivated_count integer not null default 0,
  unsubscribed_count integer not null default 0,
  status text not null default 'completed',
  error_message text,
  created_at timestamptz not null default now()
);

-- Engagement snapshot: one row per subscriber, per import
-- NOTE: named substack_engagement_snapshots (not newsletter_engagement) to avoid
-- colliding with the existing public.newsletter_engagement event-log table.
create table if not exists substack_engagement_snapshots (
  id uuid primary key default gen_random_uuid(),
  subscriber_id uuid not null references substack_subscribers(id) on delete cascade,
  member_id uuid references members(id) on delete set null,
  import_run_id uuid references substack_import_runs(id) on delete set null,

  emails_received_6mo integer,
  emails_dropped_6mo integer,
  num_emails_opened integer,
  emails_opened_6mo integer,
  emails_opened_7d integer,
  emails_opened_30d integer,
  last_email_open timestamptz,

  links_clicked integer,
  last_clicked_at timestamptz,

  unique_emails_seen_6mo integer,
  unique_emails_seen_7d integer,
  unique_emails_seen_30d integer,

  post_views integer,
  post_views_7d integer,
  post_views_30d integer,
  unique_posts_seen integer,
  unique_posts_seen_7d integer,
  unique_posts_seen_30d integer,

  comments integer,
  comments_7d integer,
  comments_30d integer,
  shares integer,
  shares_7d integer,
  shares_30d integer,

  subscriptions_gifted integer,
  revenue numeric,
  days_active_30d integer,
  activity text,

  snapshot_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_substack_engagement_snapshots_subscriber_id on substack_engagement_snapshots(subscriber_id);
create index if not exists idx_substack_engagement_snapshots_member_id on substack_engagement_snapshots(member_id);
create index if not exists idx_substack_engagement_snapshots_import_run_id on substack_engagement_snapshots(import_run_id);