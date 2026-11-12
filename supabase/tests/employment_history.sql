BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(15);

INSERT INTO public.members (id, first_name, last_name, email, linkedin_url)
VALUES
  ('00000000-0000-0000-0000-000000000901', 'History', 'One', 'history-one@example.test', 'https://example.test/history-one'),
  ('00000000-0000-0000-0000-000000000902', 'History', 'Two', 'history-two@example.test', 'https://example.test/history-two');

SELECT lives_ok(
  $$SELECT public.save_member_employment('00000000-0000-0000-0000-000000000901', 'change', 'OldCo', 'Director', '2020-01-01')$$,
  'first position creates current employment'
);
SELECT is(
  (SELECT count(*) FROM public.employment_history WHERE member_id = '00000000-0000-0000-0000-000000000901' AND is_current),
  1::bigint,
  'first position is current'
);

SELECT lives_ok(
  $$SELECT public.save_member_employment('00000000-0000-0000-0000-000000000901', 'change', 'NewCo', 'VP', '2022-02-01')$$,
  'job change saves without error'
);
SELECT is(
  (SELECT count(*) FROM public.employment_history WHERE member_id = '00000000-0000-0000-0000-000000000901'),
  2::bigint,
  'job change preserves the previous position'
);
SELECT is(
  (SELECT end_date FROM public.employment_history WHERE member_id = '00000000-0000-0000-0000-000000000901' AND company = 'OldCo'),
  '2022-01-31'::date,
  'previous position closes the day before the new start'
);
SELECT is(
  (SELECT count(*) FROM public.employment_history WHERE member_id = '00000000-0000-0000-0000-000000000901' AND is_current),
  1::bigint,
  'job change leaves exactly one current position'
);

SELECT lives_ok(
  $$SELECT public.save_member_employment('00000000-0000-0000-0000-000000000901', 'correct', 'NewCo, Inc.', 'VP', '2022-02-01')$$,
  'correction updates the current position'
);
SELECT is(
  (SELECT count(*) FROM public.employment_history WHERE member_id = '00000000-0000-0000-0000-000000000901'),
  2::bigint,
  'correction does not create a false career transition'
);
SELECT is(
  (SELECT end_date FROM public.employment_history WHERE member_id = '00000000-0000-0000-0000-000000000901' AND company = 'OldCo'),
  '2022-01-31'::date,
  'correction leaves the previous position unchanged'
);
SELECT is(
  (SELECT company || '|' || role FROM public.employment_history WHERE member_id = '00000000-0000-0000-0000-000000000901' AND is_current),
  'NewCo, Inc.|VP',
  'corrected company and title are stored on the current position'
);
SELECT is(
  (SELECT c.name FROM public.member_profile mp JOIN public.companies c ON c.id = mp.company_id WHERE mp.member_id = '00000000-0000-0000-0000-000000000901' LIMIT 1),
  'NewCo, Inc.',
  'member profile company stays in sync with current employment'
);
SELECT is(
  (SELECT current_job_start_date FROM public.member_profile WHERE member_id = '00000000-0000-0000-0000-000000000901' LIMIT 1),
  '2022-02-01',
  'member profile start date stays in sync with current employment'
);

SELECT lives_ok(
  $$SELECT public.save_member_employment('00000000-0000-0000-0000-000000000902', 'change', 'FirstCo', 'Manager', '2024-03-01')$$,
  'a member without prior employment can add their first position'
);
SELECT is(
  (SELECT count(*) FROM public.employment_history WHERE member_id = '00000000-0000-0000-0000-000000000902' AND is_current),
  1::bigint,
  'first position for a member with no history is current'
);
SELECT throws_ok(
  $$INSERT INTO public.employment_history (member_id, company, role, start_date, is_current, source) VALUES ('00000000-0000-0000-0000-000000000901', 'AnotherCo', 'CFO', '2023-01-01', true, 'Manual')$$,
  '23505',
  NULL,
  'database prevents a second current position'
);

SELECT * FROM finish();
ROLLBACK;
