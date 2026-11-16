BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(5);

SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.duplicate_review_pairs'::regclass),
  'duplicate review queue has row-level security enabled'
);
SELECT ok(
  NOT has_table_privilege('anon', 'public.duplicate_review_pairs', 'select'),
  'anonymous clients cannot read duplicate candidates'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.duplicate_review_pairs', 'select'),
  'signed-in clients cannot read duplicate candidates directly'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.duplicate_review_pairs', 'insert'),
  'signed-in clients cannot create duplicate candidates directly'
);
SELECT ok(
  has_table_privilege('service_role', 'public.duplicate_review_pairs', 'select'),
  'the server-only service role can read the queue after API authorization'
);

SELECT * FROM finish();
ROLLBACK;
