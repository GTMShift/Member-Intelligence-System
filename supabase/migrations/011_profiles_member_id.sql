-- 011_profiles_member_id.sql

alter table profiles
  add column if not exists member_id uuid references members(id);