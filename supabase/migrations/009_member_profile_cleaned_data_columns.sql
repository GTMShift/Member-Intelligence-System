-- 007_member_profile_cleaned_data_columns.sql

alter table member_profile
  add column if not exists bucket text,
  add column if not exists fit_score integer,
  add column if not exists tagged_manually boolean,
  add column if not exists tagged_at timestamptz,
  add column if not exists tagged_by uuid references profiles(id),
  add column if not exists tag_note text,
  add column if not exists event_interest text,
  add column if not exists dietary_restrictions text,
  add column if not exists teams_you_oversee text[],
  add column if not exists regions text[],
  add column if not exists management_layers text,
  add column if not exists address text;