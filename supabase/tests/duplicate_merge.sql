BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions, auth;
SELECT plan(21);

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) VALUES
  ('00000000-0000-0000-0000-000000000901','authenticated','authenticated','merge-admin@example.test',now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000902','authenticated','authenticated','merge-linked@example.test',now(),'{}','{}',now(),now());
UPDATE public.profiles SET role = 'admin' WHERE id = '00000000-0000-0000-0000-000000000901';

INSERT INTO public.members (id, first_name, last_name, email, linkedin_url, phone) VALUES
  ('00000000-0000-0000-0000-000000000201','Keep','Record','keep@example.test','https://example.test/keep','111'),
  ('00000000-0000-0000-0000-000000000202','Duplicate','Record','duplicate@example.test','https://example.test/duplicate','222'),
  ('00000000-0000-0000-0000-000000000203','Third','Record','third@example.test','https://example.test/third','333');
UPDATE public.profiles SET member_id = '00000000-0000-0000-0000-000000000202' WHERE id = '00000000-0000-0000-0000-000000000902';
INSERT INTO public.companies (id, name) VALUES
  ('00000000-0000-0000-0000-000000000301','Company A'),
  ('00000000-0000-0000-0000-000000000302','Company B');
INSERT INTO public.member_profile (member_id, company_id, city, bucket) VALUES
  ('00000000-0000-0000-0000-000000000201','00000000-0000-0000-0000-000000000301','Chicago','manual_review'),
  ('00000000-0000-0000-0000-000000000202','00000000-0000-0000-0000-000000000302','Austin','manual_review');
INSERT INTO public.employment_history (member_id, company, role, start_date, is_current, source) VALUES
  ('00000000-0000-0000-0000-000000000201','Company A','Director','2020-01-01',true,'Manual'),
  ('00000000-0000-0000-0000-000000000202','Company B','VP','2022-01-01',true,'Manual');
INSERT INTO public.member_data (member_id, tier, category, data) VALUES
  ('00000000-0000-0000-0000-000000000201','user_editable','one','{"v":1}'),
  ('00000000-0000-0000-0000-000000000202','admin_only','two','{"v":2}');
INSERT INTO public.duplicate_review_pairs (id, member_low_id, member_high_id, match_reasons, confidence) VALUES
  ('00000000-0000-0000-0000-000000000401','00000000-0000-0000-0000-000000000201','00000000-0000-0000-0000-000000000202','[{"field":"email"}]',0.95),
  ('00000000-0000-0000-0000-000000000402','00000000-0000-0000-0000-000000000202','00000000-0000-0000-0000-000000000203','[{"field":"phone"}]',0.70);

SELECT ok(NOT has_function_privilege('anon','public.merge_duplicate_members(uuid,uuid,jsonb,uuid)','execute'), 'anonymous callers cannot run a merge');
SELECT ok(NOT has_function_privilege('authenticated','public.merge_duplicate_members(uuid,uuid,jsonb,uuid)','execute'), 'authenticated callers cannot run a merge directly');
SELECT ok(has_function_privilege('service_role','public.merge_duplicate_members(uuid,uuid,jsonb,uuid)','execute'), 'the server role can invoke the merge after API admin checks');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.duplicate_member_merge_audit'::regclass), 'merge audit has row-level security enabled');
SELECT ok(NOT has_table_privilege('anon','public.duplicate_member_merge_audit','select'), 'anonymous callers cannot read merge audit data');
SELECT ok(NOT has_table_privilege('authenticated','public.duplicate_member_merge_audit','select'), 'signed-in users cannot read merge audit data directly');
SELECT ok(has_table_privilege('service_role','public.duplicate_member_merge_audit','insert'), 'only the server role can write merge audit records');

SET LOCAL ROLE service_role;
SELECT throws_ok(
  $$SELECT public.merge_duplicate_members('00000000-0000-0000-0000-000000000401','00000000-0000-0000-0000-000000000201','{"email":"a"}'::jsonb,'00000000-0000-0000-0000-000000000902')$$,
  'P0001', NULL, 'the database rejects a caller whose trusted profile is not an admin'
);
SELECT lives_ok(
  $$SELECT public.merge_duplicate_members(
    '00000000-0000-0000-0000-000000000401',
    '00000000-0000-0000-0000-000000000201',
    '{"first_name":"b","last_name":"a","email":"a","linkedin_url":"a","phone":"b","company_name":"b","job_title":"b","seniority_level":"a","city":"a","state_region":"a","country":"a"}'::jsonb,
    '00000000-0000-0000-0000-000000000901')$$,
  'an authorized admin can merge a reviewed pair'
);
RESET ROLE;

SELECT is((SELECT merged_into_member_id FROM public.members WHERE id = '00000000-0000-0000-0000-000000000202'),'00000000-0000-0000-0000-000000000201'::uuid,'the source record is archived and points to the survivor');
SELECT ok(NOT EXISTS (
  SELECT 1 FROM public.search_members_admin_impl(NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'last_name_asc',1,100,NULL,NULL)
  WHERE id = '00000000-0000-0000-0000-000000000202'
),'archived source records are omitted from the admin directory search');
SELECT ok(EXISTS (
  SELECT 1 FROM public.members_history WHERE id = '00000000-0000-0000-0000-000000000202'
),'member history retains its original source ID with the foreign key intact');
SELECT is((SELECT first_name FROM public.members WHERE id = '00000000-0000-0000-0000-000000000201'),'Duplicate','the selected field source is applied to the survivor');
SELECT is((SELECT city FROM public.member_profile WHERE member_id = '00000000-0000-0000-0000-000000000201'),'Chicago','the selected member profile fields are applied');
SELECT is((SELECT count(*) FROM public.employment_history WHERE member_id = '00000000-0000-0000-0000-000000000201'),2::bigint,'both employment rows remain in the survivor timeline');
SELECT is((SELECT company || '|' || role FROM public.employment_history WHERE member_id = '00000000-0000-0000-0000-000000000201' AND is_current),'Company B|VP','the selected current job stays current and synchronized');
SELECT is((SELECT count(*) FROM public.employment_history WHERE member_id = '00000000-0000-0000-0000-000000000201' AND is_current),1::bigint,'the merged member has exactly one current job');
SELECT is((SELECT count(*) FROM public.member_data WHERE member_id = '00000000-0000-0000-0000-000000000201'),2::bigint,'member data from both records is retained');
SELECT is((SELECT member_id FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000902'),'00000000-0000-0000-0000-000000000201'::uuid,'the single verified login link moves to the survivor');
SELECT is((SELECT member_low_id::text || ':' || member_high_id::text FROM public.duplicate_review_pairs WHERE id = '00000000-0000-0000-0000-000000000402'),'00000000-0000-0000-0000-000000000201:00000000-0000-0000-0000-000000000203','other queued pairs are rewired to the survivor');
SELECT is((SELECT count(*) FROM public.duplicate_member_merge_audit WHERE pair_id = '00000000-0000-0000-0000-000000000401' AND merged_member_id = '00000000-0000-0000-0000-000000000202' AND jsonb_array_length(linked_record_snapshots->'member_data') = 1),1::bigint,'the merge audit preserves source IDs and linked-row snapshots');

SELECT * FROM finish();
ROLLBACK;
