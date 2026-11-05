begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, auth;

insert into auth.users (
  id, aud, role, email, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000101', 'authenticated', 'authenticated', 'member-one@example.test', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000102', 'authenticated', 'authenticated', 'member-two@example.test', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000103', 'authenticated', 'authenticated', 'admin@example.test', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000104', 'authenticated', 'authenticated', 'unlinked@example.test', now(), '{}', '{}', now(), now());

insert into public.members (id, first_name, last_name, email, linkedin_url) values
  ('00000000-0000-0000-0000-000000000201', 'Member', 'One', 'member-one@example.test', 'https://example.test/member-one'),
  ('00000000-0000-0000-0000-000000000202', 'Member', 'Two', 'member-two@example.test', 'https://example.test/member-two'),
  ('00000000-0000-0000-0000-000000000203', 'Admin', 'Account', 'admin@example.test', 'https://example.test/admin');

update public.profiles
set member_id = '00000000-0000-0000-0000-000000000201'
where id = '00000000-0000-0000-0000-000000000101';

update public.profiles
set member_id = '00000000-0000-0000-0000-000000000202'
where id = '00000000-0000-0000-0000-000000000102';

update public.profiles
set role = 'admin', member_id = '00000000-0000-0000-0000-000000000203'
where id = '00000000-0000-0000-0000-000000000103';

insert into public.member_profile (member_id, city, bucket) values
  ('00000000-0000-0000-0000-000000000201', 'Chicago', 'manual_review'),
  ('00000000-0000-0000-0000-000000000202', 'Austin', 'manual_review'),
  ('00000000-0000-0000-0000-000000000203', 'Boston', 'manual_review');

insert into public.member_data (member_id, tier, category, data) values
  ('00000000-0000-0000-0000-000000000201', 'user_editable', 'about', '{"text":"member-owned"}'),
  ('00000000-0000-0000-0000-000000000201', 'admin_only', 'intelligence', '{"text":"private"}');

select plan(45);

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);

select is((select count(id) from public.members), 0::bigint, 'anonymous callers cannot read members');
select ok(not has_function_privilege('anon', 'public.link_my_member_profile(uuid)', 'execute'), 'anonymous callers cannot link profiles');
select ok(not has_function_privilege('anon', 'public.submit_my_member_access_request(jsonb)', 'execute'), 'anonymous callers cannot submit member access requests');
select ok(not has_function_privilege('anon', 'public.review_member_access_request(uuid,text,text)', 'execute'), 'anonymous callers cannot review member access requests');
select ok(not has_function_privilege('anon', 'public.delete_member_safely(uuid)', 'execute'), 'anonymous callers cannot delete members');
select is(
  (select count(*) from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'create_member_full'
      and has_function_privilege('authenticated', p.oid, 'execute')
      and (not p.prosecdef or p.prosrc not like '%Administrator access required%')),
  0::bigint,
  'authenticated callers can execute only guarded SECURITY DEFINER member-creation overloads'
);
select is(
  (select count(*) from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'create_member_full'
      and p.pronargs = 39
      and p.proargnames[1] = 'p_first_name'
      and p.proargnames[8] = 'p_current_start_date'
      and p.proargnames[19] = 'p_bucket'
      and p.proargnames[38] = 'p_region_latin_america'
      and p.proargnames[39] = 'p_socials'
      and p.prosecdef
      and p.prosrc like '%Administrator access required%'
      and has_function_privilege('authenticated', p.oid, 'execute')),
  1::bigint,
  'authenticated execution is granted to the exact reviewed create_member_full signature'
);
select is(
  (select count(*) from pg_policies
    where schemaname = 'public'
      and policyname in ('temp_allow_all', 'temp_all')),
  0::bigint,
  'known temporary allow-all policies are removed'
);
select ok(
  not has_table_privilege('anon', 'public.members', 'TRUNCATE')
  and not has_table_privilege('authenticated', 'public.members', 'TRUNCATE'),
  'anonymous and authenticated callers cannot truncate member data'
);
select is(
  (select count(*) from pg_policies
    where schemaname = 'public'
      and tablename = 'speaker_applications'
      and policyname in (
        'Admins can manage applications',
        'Members can read own applications',
        'Members can submit applications'
      )),
  0::bigint,
  'legacy email-based speaker policies are removed'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(public.current_user_member_id(), '00000000-0000-0000-0000-000000000201'::uuid, 'linked member resolves only their trusted profile link');
select is((select count(id) from public.members), 1::bigint, 'member sees only their own member record');
select is((select count(member_id) from public.member_profile), 0::bigint, 'member cannot read member_profile rows directly');
select is(public.get_my_member_profile()->>'city', 'Chicago', 'member safe-profile RPC returns their editable profile fields');
select ok(
  not (public.get_my_member_profile() ?| array[
    'bucket', 'fit_score', 'tag_note', 'tagged_by', 'tagged_at', 'icp',
    'work_email_enriched', 'additional_emails', 'signup_source', 'tags', 'metro_area_id'
  ]),
  'member safe-profile RPC omits admin-only and enrichment fields'
);
select is((select count(id) from public.member_data where tier = 'admin_only'), 0::bigint, 'member cannot read admin-only member data');
select lives_ok(
  'update public.member_profile set city = ''Direct edit'' where member_id = ''00000000-0000-0000-0000-000000000201''',
  'direct profile table updates do not bypass the scoped member operation'
);
select is(
  public.get_my_member_profile()->>'city',
  'Chicago', 'direct profile table update has no effect'
);
select lives_ok(
  $$select public.save_my_member_profile('{"city":"Evanston","bucket":"icp_no","icp":"NO"}'::jsonb)$$,
  'member can update an editable field through the scoped profile operation'
);
select is(
  public.get_my_member_profile()->>'city',
  'Evanston', 'member profile edit is saved to their own record'
);
select lives_ok(
  'update public.member_profile set member_id = ''00000000-0000-0000-0000-000000000202'' where member_id = ''00000000-0000-0000-0000-000000000201''',
  'member cannot relink a profile through direct table access'
);
select is(
  public.get_my_member_profile()->>'member_id',
  '00000000-0000-0000-0000-000000000201', 'trusted member link remains unchanged'
);
select throws_ok(
  'insert into public.members (first_name, last_name, email, linkedin_url) values (''New'', ''Contact'', ''new@example.test'', ''https://example.test/new'')',
  '42501', null, 'member cannot create a contact record to grant portal access'
);
select throws_ok(
  'update public.profiles set role = ''admin'' where id = ''00000000-0000-0000-0000-000000000101''',
  '42501', null, 'member cannot change their trusted role'
);
select throws_ok(
  'update public.profiles set member_id = ''00000000-0000-0000-0000-000000000202'' where id = ''00000000-0000-0000-0000-000000000101''',
  '42501', null, 'member cannot change their trusted member link'
);
select throws_ok(
  'select * from public.search_members(null, null, null, null, null, null, null, null, null, ''last_name_asc'', 1, 50, null)',
  'P0001', null, 'member cannot call the admin member-search RPC'
);
select throws_ok(
  $$select public.submit_my_member_access_request('{"first_name":"Member","last_name":"One"}'::jsonb)$$,
  'P0001', null, 'a linked member cannot create a new access request'
);
select is(
  (select count(*) from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'search_members'
      and has_function_privilege('authenticated', p.oid, 'execute')
      and (not p.prosecdef or p.prosrc not like '%Administrator access required%')),
  0::bigint,
  'all executable member-search overloads are guarded SECURITY DEFINER wrappers'
);
select is(
  (select count(*) from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'search_members'
      and 'p_bucket' = any(p.proargnames)
      and (not p.prosecdef or p.prosrc not like '%Administrator access required%')),
  0::bigint,
  'any p_bucket member-search overload remains an admin-checked wrapper'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000104', true);
select is(public.link_my_member_profile(null), null::uuid, 'unlinked sign-in does not link by matching or creating a contact');
select is((select count(id) from public.members), 0::bigint, 'unlinked sign-in cannot enter the member data set');
select lives_ok(
  $$select public.submit_my_member_access_request('{"first_name":"New","last_name":"Person","city":"Chicago"}'::jsonb)$$,
  'an unlinked signed-in member can save a pending access request'
);
select throws_ok(
  $$select public.submit_my_member_access_request('{"first_name":"New","last_name":"Person","role":"admin"}'::jsonb)$$,
  'P0001', null, 'request payload rejects unapproved fields such as a role'
);
select is(
  (select count(*) from public.member_access_requests where auth_user_id = '00000000-0000-0000-0000-000000000104'),
  1::bigint, 'the requester can read their own submitted request'
);
select is((select count(id) from public.members), 0::bigint, 'submitting an access request does not create a member record');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
select is(
  (select count(*) from public.member_access_requests where auth_user_id = '00000000-0000-0000-0000-000000000104'),
  0::bigint, 'members cannot read another account’s access request'
);
select throws_ok(
  $$select public.review_member_access_request((select id from public.member_access_requests where auth_user_id = '00000000-0000-0000-0000-000000000104'), 'reviewed', null)$$,
  'P0001', null, 'members cannot review access requests'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000103', true);
select is((select count(id) from public.members), 3::bigint, 'admin can read the management directory');
select is((select count(id) from public.member_data where tier = 'admin_only'), 1::bigint, 'admin can read admin-only member data');
select is((select count(*) from public.member_access_requests), 1::bigint, 'admin can read pending access requests');
select lives_ok(
  $$select public.review_member_access_request((select id from public.member_access_requests limit 1), 'reviewed', 'Verified for next setup step')$$,
  'admin can mark a request reviewed'
);
select is((select status from public.member_access_requests limit 1), 'reviewed', 'admin review status is persisted');
select is(
  (select bucket from public.member_profile where member_id = '00000000-0000-0000-0000-000000000201'),
  'manual_review', 'member profile write RPC ignores internal classification fields'
);
select lives_ok(
  'update public.member_profile set bucket = ''primary_icp'' where member_id = ''00000000-0000-0000-0000-000000000201''',
  'admin can update internal profile classification'
);
select is(
  (select count(*) from public.search_members(null, null, null, null, null, null, null, null, null, 'last_name_asc', 1, 50, null)),
  3::bigint,
  'admin search RPC returns directory records'
);

select * from finish();
rollback;
