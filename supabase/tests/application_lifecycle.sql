begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, auth;

select plan(26);

-- Fixtures: an admin, one existing directory member, and a member record that
-- is already linked to someone else's login.
insert into auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000301', 'authenticated', 'authenticated', 'lifecycle-admin@example.test', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000302', 'authenticated', 'authenticated', 'linked-elsewhere@example.test', now(), '{}', '{}', now(), now());

insert into public.members (id, first_name, last_name, email, linkedin_url) values
  ('00000000-0000-0000-0000-000000000401', 'Existing', 'Member', 'existing@example.test', 'https://example.test/in/existing'),
  ('00000000-0000-0000-0000-000000000402', 'Taken', 'Record', 'taken@example.test', 'https://example.test/in/taken');

update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-000000000301';
update public.profiles set role = 'member', member_id = '00000000-0000-0000-0000-000000000402'
where id = '00000000-0000-0000-0000-000000000302';

-- Public form submissions (anon key)
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);

select lives_ok(
  $$insert into public.join_us_applications (first_name, last_name, email_address, linkedin, company, job_title, status, member_id)
    values ('New', 'Applicant', 'new@example.test', 'https://example.test/in/new', 'Initech', 'Director', 'approved',
            '00000000-0000-0000-0000-000000000401')$$,
  'public form can submit an application'
);
select lives_ok(
  $$insert into public.join_us_applications (first_name, last_name, email_address, linkedin)
    values ('Early', 'Approval', 'early@example.test', 'https://example.test/in/early'),
           ('Existing', 'Member', 'EXISTING@example.test', null),
           ('Ambiguous', 'Match', 'existing@example.test', 'https://example.test/in/taken'),
           ('No', 'LinkedIn', 'nolinkedin@example.test', null),
           ('Lifecycle', 'Admin', 'lifecycle-admin@example.test', 'https://example.test/in/lifecycle-admin'),
           ('Second', 'Login', 'second-login@example.test', 'https://example.test/in/taken'),
           ('Rejected', 'Applicant', 'rejected@example.test', 'https://example.test/in/rejected')$$,
  'public form can submit several applications'
);

reset role;
select is(
  (select status || '/' || coalesce(member_id::text, 'unlinked') from public.join_us_applications where email_address = 'new@example.test'),
  'pending/unlinked',
  'a submitted row cannot choose its own status or member link'
);

-- First sign-in while pending
insert into auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000303', 'authenticated', 'authenticated', 'new@example.test', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000304', 'authenticated', 'authenticated', 'rejected@example.test', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000305', 'authenticated', 'authenticated', 'existing@example.test', now(), '{}', '{}', now(), now());

select is(
  (select role || '/' || coalesce(member_id::text, 'unlinked') from public.profiles where id = '00000000-0000-0000-0000-000000000303'),
  'applicant/unlinked',
  'a pending applicant signs in as an applicant'
);
select is(
  (select role || '/' || coalesce(member_id::text, 'unlinked') from public.profiles where id = '00000000-0000-0000-0000-000000000305'),
  'applicant/unlinked',
  'an existing directory member is not linked by email at sign-in'
);

-- Admin decisions go through the backend's service-role client
set local role service_role;

select lives_ok(
  $$update public.join_us_applications
    set status = 'approved', reviewed_by = '00000000-0000-0000-0000-000000000301', reviewed_at = now()
    where email_address = 'new@example.test'$$,
  'admin can approve a new applicant'
);
select is(
  (select count(*) from public.members where email = 'new@example.test'),
  1::bigint,
  'approval creates exactly one member record'
);
select is(
  (select p.role || '/' || (p.member_id = j.member_id)::text
   from public.profiles p join public.join_us_applications j on lower(j.email_address) = lower(p.email)
   where p.id = '00000000-0000-0000-0000-000000000303'),
  'member/true',
  'an applicant who already signed in gets member access on approval'
);

select lives_ok(
  $$update public.join_us_applications set status = 'approved', reviewed_at = now()
    where email_address = 'early@example.test'$$,
  'admin can approve before the applicant signs in'
);

select lives_ok(
  $$update public.join_us_applications set status = 'approved', reviewed_at = now()
    where email_address = 'EXISTING@example.test'$$,
  'admin can approve an existing directory member'
);
select is(
  (select member_id from public.join_us_applications where email_address = 'EXISTING@example.test'),
  '00000000-0000-0000-0000-000000000401'::uuid,
  'approval reuses the existing member record (case-insensitive email)'
);
select is(
  (select role || '/' || coalesce(member_id::text, 'unlinked') from public.profiles where id = '00000000-0000-0000-0000-000000000305'),
  'member/00000000-0000-0000-0000-000000000401',
  'the existing member gets access to their own record once approved'
);

select throws_ok(
  $$update public.join_us_applications set status = 'approved' where email_address = 'existing@example.test'$$,
  'Ambiguous member match: email and LinkedIn belong to different members',
  'email and LinkedIn that match different members are not merged'
);
select throws_ok(
  $$update public.join_us_applications set status = 'approved' where email_address = 'nolinkedin@example.test'$$,
  'LinkedIn URL is required to create a new member from a Join Us application',
  'a brand-new member without LinkedIn fails with a clear message'
);
select is(
  (select status from public.join_us_applications where email_address = 'nolinkedin@example.test'),
  'pending',
  'a failed approval leaves the application pending'
);

select lives_ok(
  $$update public.join_us_applications set status = 'approved' where email_address = 'lifecycle-admin@example.test'$$,
  'an application from an admin email can be approved'
);
select is(
  (select role from public.profiles where id = '00000000-0000-0000-0000-000000000301'),
  'admin',
  'approving an admin email does not demote the admin'
);

select throws_ok(
  $$update public.join_us_applications set status = 'approved' where email_address = 'second-login@example.test'$$,
  'Member record is already linked to a different login',
  'a member record linked to another login fails with a clear message'
);

select lives_ok(
  $$update public.join_us_applications set status = 'rejected', reviewed_at = now() where email_address = 'rejected@example.test'$$,
  'admin can reject an application'
);
select is(
  (select role || '/' || coalesce(member_id::text, 'unlinked') from public.profiles where id = '00000000-0000-0000-0000-000000000304'),
  'applicant/unlinked',
  'a rejected applicant stays an applicant'
);
select throws_ok(
  $$update public.join_us_applications set status = 'approved' where email_address = 'rejected@example.test'$$,
  'Only pending applications can be approved or rejected',
  'a rejected application cannot be approved later'
);
select throws_ok(
  $$update public.join_us_applications set status = 'rejected' where email_address = 'new@example.test'$$,
  'Only pending applications can be approved or rejected',
  'an approved application cannot be rejected later'
);

-- Sign-in after approval
reset role;
-- A trusted admin process links the early applicant's new record to another login first.
update public.profiles
set member_id = (select member_id from public.join_us_applications where email_address = 'early@example.test')
where id = '00000000-0000-0000-0000-000000000304';

select lives_ok(
  $$insert into auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values ('00000000-0000-0000-0000-000000000306', 'authenticated', 'authenticated', 'early@example.test', now(), '{}', '{}', now(), now())$$,
  'sign-in still works when the approved member record is linked to another login'
);
select is(
  (select role || '/' || coalesce(member_id::text, 'unlinked') from public.profiles where id = '00000000-0000-0000-0000-000000000306'),
  'applicant/unlinked',
  'that sign-in stays an unlinked applicant'
);

-- An applicant with a stale member link is still not a member
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000304', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(public.current_user_member_id(), null::uuid, 'an applicant with a stale member link is not a member');

-- An unlinked applicant can ask for member access (039)
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000305', true);
reset role;
update public.profiles set role = 'applicant', member_id = null where id = '00000000-0000-0000-0000-000000000305';
set local role authenticated;
select lives_ok(
  $$select public.submit_my_member_access_request('{"first_name":"Existing","last_name":"Member"}'::jsonb)$$,
  'an unlinked applicant can submit a member access request'
);

select * from finish();
rollback;
