-- 013_member_profile_team_size.sql

alter table member_profile
  add column if not exists team_size integer;