-- 012_profiles_member_id_unique.sql

alter table profiles
  add constraint profiles_member_id_unique unique (member_id);