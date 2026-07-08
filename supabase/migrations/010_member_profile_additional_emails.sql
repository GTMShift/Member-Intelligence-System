-- 008_member_profile_additional_emails.sql

alter table member_profile
  add column if not exists additional_emails text[];