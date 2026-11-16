-- Admin review queue for duplicate candidates. No member rows are merged here.
CREATE TABLE public.duplicate_review_pairs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_low_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  member_high_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  match_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence numeric(4,3) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'deferred', 'dismissed')),
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT duplicate_review_pair_order CHECK (member_low_id < member_high_id),
  CONSTRAINT duplicate_review_pair_unique UNIQUE (member_low_id, member_high_id)
);

CREATE INDEX duplicate_review_pairs_status_created_idx
  ON public.duplicate_review_pairs (status, created_at DESC);

ALTER TABLE public.duplicate_review_pairs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.duplicate_review_pairs FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.duplicate_review_pairs TO service_role;
