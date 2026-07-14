-- 014_member_profile_tags.sql

alter table member_profile
  add column if not exists tags text[];