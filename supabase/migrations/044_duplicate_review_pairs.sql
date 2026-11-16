-- Duplicate candidate review and admin-confirmed merge support.
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

-- Admin-confirmed, transactional merge of a reviewed duplicate pair.
CREATE TABLE public.duplicate_member_merge_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pair_id uuid NOT NULL,
  survivor_id uuid NOT NULL,
  merged_member_id uuid NOT NULL,
  merged_by uuid NOT NULL REFERENCES auth.users(id),
  field_sources jsonb NOT NULL,
  before_snapshot jsonb NOT NULL,
  after_snapshot jsonb NOT NULL,
  linked_record_snapshots jsonb NOT NULL,
  moved_record_counts jsonb NOT NULL,
  merged_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.duplicate_member_merge_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.duplicate_member_merge_audit FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.duplicate_member_merge_audit TO service_role;

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS merged_into_member_id uuid REFERENCES public.members(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS members_merged_into_member_id_idx
  ON public.members (merged_into_member_id) WHERE merged_into_member_id IS NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.members'::regclass AND conname = 'members_not_merged_into_self') THEN
    ALTER TABLE public.members ADD CONSTRAINT members_not_merged_into_self
      CHECK (merged_into_member_id IS NULL OR merged_into_member_id <> id);
  END IF;
END;
$$;

-- Keep the existing secured search API while excluding archived merge sources.
DO $$
DECLARE
  v_function record;
  v_definition text;
  v_anchor text := 'LEFT JOIN employment_history eh ON eh.member_id = m.id AND eh.is_current = true';
  v_count integer := 0;
BEGIN
  FOR v_function IN
    SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'search_members_admin_impl'
  LOOP
    v_definition := pg_get_functiondef(v_function.oid);
    IF position('m.merged_into_member_id IS NULL' IN v_definition) = 0 THEN
      IF position(v_anchor IN v_definition) = 0 THEN
        RAISE EXCEPTION 'Could not safely add merged-member filtering to search_members_admin_impl';
      END IF;
      v_definition := replace(v_definition, v_anchor, v_anchor || E'\n    WHERE m.merged_into_member_id IS NULL');
      EXECUTE v_definition;
    END IF;
    v_count := v_count + 1;
  END LOOP;
  IF v_count = 0 THEN RAISE EXCEPTION 'Expected secured search_members_admin_impl function'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.merge_duplicate_members(
  p_pair_id uuid,
  p_survivor_id uuid,
  p_field_sources jsonb,
  p_admin_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_pair public.duplicate_review_pairs%ROWTYPE;
  v_low public.members%ROWTYPE;
  v_high public.members%ROWTYPE;
  v_survivor public.members%ROWTYPE;
  v_loser public.members%ROWTYPE;
  v_profile_low public.member_profile%ROWTYPE;
  v_profile_high public.member_profile%ROWTYPE;
  v_profile_id uuid;
  v_current_low public.employment_history%ROWTYPE;
  v_current_high public.employment_history%ROWTYPE;
  v_current_id uuid;
  v_selected_company text;
  v_selected_role text;
  v_company_id uuid;
  v_before jsonb;
  v_after jsonb;
  v_linked jsonb := '{}'::jsonb;
  v_counts jsonb := '{}'::jsonb;
  v_rows jsonb;
  v_count integer;
  v_link record;
  v_col record;
  v_related record;
  v_other_id uuid;
  v_new_low uuid;
  v_new_high uuid;
  v_existing_id uuid;
  v_audit_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_admin_id AND role = 'admin') THEN
    RAISE EXCEPTION 'MERGE_BLOCKED: Admin access is required.' USING ERRCODE = 'P0001';
  END IF;
  IF p_field_sources IS NULL OR jsonb_typeof(p_field_sources) <> 'object'
     OR EXISTS (
       SELECT 1 FROM jsonb_object_keys(p_field_sources) AS fields(key)
       WHERE key NOT IN ('first_name','last_name','email','linkedin_url','phone',
                       'company_name','job_title','seniority_level','city','state_region','country')
     ) THEN
    RAISE EXCEPTION 'MERGE_BLOCKED: Invalid field selections.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_each_text(p_field_sources) AS f WHERE f.value NOT IN ('a','b')) THEN
    RAISE EXCEPTION 'MERGE_BLOCKED: Invalid field selections.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_pair FROM public.duplicate_review_pairs
  WHERE id = p_pair_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'MERGE_BLOCKED: This candidate no longer exists.' USING ERRCODE = 'P0002';
  END IF;
  IF v_pair.status NOT IN ('pending','deferred') THEN
    RAISE EXCEPTION 'MERGE_BLOCKED: Only pending or deferred candidates can be merged.' USING ERRCODE = 'P0001';
  END IF;
  IF p_survivor_id NOT IN (v_pair.member_low_id, v_pair.member_high_id) THEN
    RAISE EXCEPTION 'MERGE_BLOCKED: Choose one of the two candidate profiles to keep.' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(least(v_pair.member_low_id, v_pair.member_high_id)::text || ':' || greatest(v_pair.member_low_id, v_pair.member_high_id)::text, 0));
  SELECT * INTO v_low FROM public.members WHERE id = v_pair.member_low_id FOR UPDATE;
  SELECT * INTO v_high FROM public.members WHERE id = v_pair.member_high_id FOR UPDATE;
  IF v_low.id IS NULL OR v_high.id IS NULL THEN
    RAISE EXCEPTION 'MERGE_BLOCKED: One of these member records no longer exists.' USING ERRCODE = 'P0001';
  END IF;
  v_survivor := CASE WHEN p_survivor_id = v_low.id THEN v_low ELSE v_high END;
  v_loser := CASE WHEN p_survivor_id = v_low.id THEN v_high ELSE v_low END;
  IF v_survivor.merged_into_member_id IS NOT NULL OR v_loser.merged_into_member_id IS NOT NULL THEN
    RAISE EXCEPTION 'MERGE_BLOCKED: This candidate contains an archived member record.' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE member_id = v_survivor.id)
     AND EXISTS (SELECT 1 FROM public.profiles WHERE member_id = v_loser.id) THEN
    RAISE EXCEPTION 'MERGE_BLOCKED: Both records are linked to login accounts. Resolve the account links before merging.' USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*) INTO v_count FROM public.member_profile WHERE member_id IN (v_low.id, v_high.id);
  IF v_count > 2 OR (SELECT count(*) FROM public.member_profile WHERE member_id = v_low.id) > 1
     OR (SELECT count(*) FROM public.member_profile WHERE member_id = v_high.id) > 1 THEN
    RAISE EXCEPTION 'MERGE_BLOCKED: A member has multiple profile rows. Resolve them before merging.' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO v_profile_low FROM public.member_profile WHERE member_id = v_low.id FOR UPDATE;
  SELECT * INTO v_profile_high FROM public.member_profile WHERE member_id = v_high.id FOR UPDATE;
  SELECT * INTO v_current_low FROM public.employment_history WHERE member_id = v_low.id AND is_current FOR UPDATE;
  SELECT * INTO v_current_high FROM public.employment_history WHERE member_id = v_high.id AND is_current FOR UPDATE;

  v_before := jsonb_build_object('pair', to_jsonb(v_pair), 'profile_a', to_jsonb(v_low),
    'profile_b', to_jsonb(v_high), 'member_profile_a', to_jsonb(v_profile_low),
    'member_profile_b', to_jsonb(v_profile_high), 'current_job_a', to_jsonb(v_current_low),
    'current_job_b', to_jsonb(v_current_high));

  FOR v_link IN SELECT * FROM (VALUES
    ('member_profile','member_id'), ('employment_history','member_id'),
    ('member_data','member_id'), ('interactions','member_id'),
    ('member_socials','member_id'), ('event_signups','member_id'),
    ('newsletter_engagement','member_id'), ('enrichment_runs','member_id'),
    ('profiles','member_id'), ('substack_subscribers','member_id'),
    ('substack_engagement_snapshots','member_id'), ('join_us_applications','member_id'),
    ('otr_applications','member_id'), ('notifications','member_id'),
    ('member_access_requests','member_id'), ('profile_update_submissions','member_id'),
    ('speaker_applications','member_id'), ('duplicate_flags','existing_member_id'),
    ('members_history','id'), ('member_profile_history','member_id'),
    ('employment_history_log','member_id')
  ) AS links(table_name, column_name)
  LOOP
    IF to_regclass(format('public.%I', v_link.table_name)) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) FROM public.%I t WHERE t.%I = $1', v_link.table_name, v_link.column_name)
      INTO v_rows USING v_loser.id;
    v_linked := v_linked || jsonb_build_object(v_link.table_name, v_rows);
    v_counts := v_counts || jsonb_build_object(v_link.table_name, 0);
  END LOOP;

  v_selected_company := CASE
    WHEN coalesce(p_field_sources->>'company_name','a') = 'a' THEN
      coalesce(v_current_low.company, (SELECT c.name FROM public.companies c WHERE c.id = v_profile_low.company_id))
    ELSE coalesce(v_current_high.company, (SELECT c.name FROM public.companies c WHERE c.id = v_profile_high.company_id)) END;
  v_selected_role := CASE
    WHEN coalesce(p_field_sources->>'job_title','a') = 'a' THEN v_current_low.role
    ELSE v_current_high.role END;

  FOR v_col IN SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'members'
      AND column_name NOT IN ('id','first_name','last_name','email','linkedin_url','phone','created_at','last_updated')
  LOOP
    EXECUTE format('UPDATE public.members target SET %1$I = coalesce(target.%1$I, source.%1$I) FROM public.members source WHERE target.id = $1 AND source.id = $2', v_col.column_name)
      USING v_survivor.id, v_loser.id;
  END LOOP;

  UPDATE public.members SET
    first_name = CASE WHEN coalesce(p_field_sources->>'first_name','a') = 'a' THEN v_low.first_name ELSE v_high.first_name END,
    last_name = CASE WHEN coalesce(p_field_sources->>'last_name','a') = 'a' THEN v_low.last_name ELSE v_high.last_name END,
    email = CASE WHEN coalesce(p_field_sources->>'email','a') = 'a' THEN v_low.email ELSE v_high.email END,
    linkedin_url = CASE WHEN coalesce(p_field_sources->>'linkedin_url','a') = 'a' THEN v_low.linkedin_url ELSE v_high.linkedin_url END,
    phone = CASE WHEN coalesce(p_field_sources->>'phone','a') = 'a' THEN v_low.phone ELSE v_high.phone END,
    enriched_at = coalesce(v_survivor.enriched_at, v_loser.enriched_at),
    record_source = coalesce(v_survivor.record_source, v_loser.record_source),
    subscription_status = coalesce(v_survivor.subscription_status, v_loser.subscription_status),
    signup_date = coalesce(v_survivor.signup_date, v_loser.signup_date),
    last_engagement_date = greatest(v_survivor.last_engagement_date, v_loser.last_engagement_date),
    engagement_score = greatest(v_survivor.engagement_score, v_loser.engagement_score)
  WHERE id = v_survivor.id;

  IF v_profile_high.member_id IS NOT NULL AND v_profile_low.member_id IS NULL THEN
    UPDATE public.member_profile SET member_id = v_survivor.id WHERE member_id = v_loser.id;
    v_profile_id := v_profile_high.id;
  ELSE
    v_profile_id := v_profile_low.id;
  END IF;
  IF v_profile_low.id IS NOT NULL AND v_profile_high.id IS NOT NULL THEN
    FOR v_col IN SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'member_profile'
        AND column_name NOT IN ('id','member_id','updated_at')
    LOOP
      EXECUTE format('UPDATE public.member_profile target SET %1$I = coalesce(target.%1$I, source.%1$I) FROM public.member_profile source WHERE target.id = $1 AND source.id = $2', v_col.column_name)
        USING v_profile_id, CASE WHEN v_profile_id = v_profile_low.id THEN v_profile_high.id ELSE v_profile_low.id END;
    END LOOP;
    v_counts := jsonb_set(v_counts, ARRAY['member_profile'], '1'::jsonb, true);
  ELSIF v_profile_high.id IS NOT NULL THEN
    v_counts := jsonb_set(v_counts, ARRAY['member_profile'], '1'::jsonb, true);
  END IF;
  IF v_profile_id IS NOT NULL THEN
    SELECT id INTO v_company_id FROM public.companies
    WHERE lower(btrim(name)) = lower(btrim(v_selected_company)) ORDER BY id LIMIT 1;
    IF v_selected_company IS NOT NULL AND v_company_id IS NULL THEN
      PERFORM pg_advisory_xact_lock(hashtext(lower(btrim(v_selected_company)))::bigint);
      SELECT id INTO v_company_id FROM public.companies
      WHERE lower(btrim(name)) = lower(btrim(v_selected_company)) ORDER BY id LIMIT 1;
      IF v_company_id IS NULL THEN
        INSERT INTO public.companies(name) VALUES (btrim(v_selected_company)) RETURNING id INTO v_company_id;
      END IF;
    END IF;
    UPDATE public.member_profile SET
      company_id = coalesce(v_company_id, company_id),
      seniority_level = CASE WHEN coalesce(p_field_sources->>'seniority_level','a') = 'a' THEN v_profile_low.seniority_level ELSE v_profile_high.seniority_level END,
      city = CASE WHEN coalesce(p_field_sources->>'city','a') = 'a' THEN v_profile_low.city ELSE v_profile_high.city END,
      state_region = CASE WHEN coalesce(p_field_sources->>'state_region','a') = 'a' THEN v_profile_low.state_region ELSE v_profile_high.state_region END,
      country = CASE WHEN coalesce(p_field_sources->>'country','a') = 'a' THEN v_profile_low.country ELSE v_profile_high.country END,
      work_email_enriched = coalesce(work_email_enriched, CASE WHEN v_survivor.id = v_low.id THEN v_profile_high.work_email_enriched ELSE v_profile_low.work_email_enriched END),
      bucket = coalesce(bucket, CASE WHEN v_survivor.id = v_low.id THEN v_profile_high.bucket ELSE v_profile_low.bucket END),
      updated_at = now()
    WHERE id = v_profile_id;
    IF v_profile_low.id IS NOT NULL AND v_profile_high.id IS NOT NULL AND v_profile_low.id <> v_profile_high.id THEN
      DELETE FROM public.member_profile WHERE id = CASE WHEN v_profile_id = v_profile_low.id THEN v_profile_high.id ELSE v_profile_low.id END;
    END IF;
  END IF;

  -- Preserve both timelines, but retain only the explicitly selected current job.
  v_current_id := CASE
    WHEN coalesce(p_field_sources->>'job_title','a') = 'a' AND v_current_low.id IS NOT NULL THEN v_current_low.id
    WHEN coalesce(p_field_sources->>'job_title','a') = 'b' AND v_current_high.id IS NOT NULL THEN v_current_high.id
    WHEN coalesce(p_field_sources->>'company_name','a') = 'a' AND v_current_low.id IS NOT NULL THEN v_current_low.id
    WHEN coalesce(p_field_sources->>'company_name','a') = 'b' AND v_current_high.id IS NOT NULL THEN v_current_high.id
    ELSE coalesce(v_current_low.id, v_current_high.id) END;
  UPDATE public.employment_history SET is_current = false
  WHERE member_id IN (v_low.id, v_high.id) AND is_current;
  UPDATE public.employment_history SET member_id = v_survivor.id
  WHERE member_id = v_loser.id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_counts := jsonb_set(v_counts, ARRAY['employment_history'], to_jsonb(v_count), true);
  IF v_current_id IS NOT NULL THEN
    UPDATE public.employment_history SET
      is_current = true,
      company = coalesce(nullif(btrim(v_selected_company), ''), company),
      role = coalesce(nullif(btrim(v_selected_role), ''), role)
    WHERE id = v_current_id;
  END IF;
  IF v_profile_id IS NOT NULL AND v_selected_company IS NOT NULL THEN
    UPDATE public.member_profile SET company_id = v_company_id, updated_at = now() WHERE id = v_profile_id;
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE member_id = v_loser.id) THEN
    UPDATE public.profiles SET member_id = v_survivor.id WHERE member_id = v_loser.id;
    v_counts := jsonb_set(v_counts, ARRAY['profiles'], '1'::jsonb, true);
  END IF;

  FOR v_link IN SELECT * FROM (VALUES
    ('member_data','member_id'), ('interactions','member_id'), ('member_socials','member_id'),
    ('event_signups','member_id'), ('newsletter_engagement','member_id'), ('enrichment_runs','member_id'),
    ('substack_subscribers','member_id'), ('substack_engagement_snapshots','member_id'),
    ('join_us_applications','member_id'), ('otr_applications','member_id'), ('notifications','member_id'),
    ('member_access_requests','member_id'), ('profile_update_submissions','member_id'),
    ('speaker_applications','member_id'), ('duplicate_flags','existing_member_id')
  ) AS links(table_name, column_name)
  LOOP
    IF to_regclass(format('public.%I', v_link.table_name)) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('UPDATE public.%I SET %I = $1 WHERE %I = $2', v_link.table_name, v_link.column_name, v_link.column_name)
      USING v_survivor.id, v_loser.id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_counts := jsonb_set(v_counts, ARRAY[v_link.table_name], to_jsonb(coalesce((v_counts->>v_link.table_name)::integer,0) + v_count), true);
  END LOOP;

  -- Keep other queued pairs by pointing them at the survivor; coalesce pairs if needed.
  FOR v_related IN SELECT * FROM public.duplicate_review_pairs
    WHERE id <> v_pair.id AND (member_low_id = v_loser.id OR member_high_id = v_loser.id) FOR UPDATE
  LOOP
    v_other_id := CASE WHEN v_related.member_low_id = v_loser.id THEN v_related.member_high_id ELSE v_related.member_low_id END;
    IF v_other_id = v_survivor.id THEN
      DELETE FROM public.duplicate_review_pairs WHERE id = v_related.id;
      CONTINUE;
    END IF;
    v_new_low := least(v_survivor.id, v_other_id);
    v_new_high := greatest(v_survivor.id, v_other_id);
    v_existing_id := NULL;
    SELECT id INTO v_existing_id FROM public.duplicate_review_pairs
      WHERE member_low_id = v_new_low AND member_high_id = v_new_high AND id <> v_related.id FOR UPDATE;
    IF v_existing_id IS NULL THEN
      UPDATE public.duplicate_review_pairs SET member_low_id = v_new_low, member_high_id = v_new_high,
        updated_at = now() WHERE id = v_related.id;
    ELSE
      UPDATE public.duplicate_review_pairs existing SET
        match_reasons = (SELECT coalesce(jsonb_agg(DISTINCT value), '[]'::jsonb)
          FROM jsonb_array_elements(existing.match_reasons || v_related.match_reasons) AS reasons(value)),
        confidence = greatest(existing.confidence, v_related.confidence),
        status = CASE WHEN existing.status = 'pending' OR v_related.status = 'pending' THEN 'pending'
                      WHEN existing.status = 'deferred' OR v_related.status = 'deferred' THEN 'deferred' ELSE 'dismissed' END,
        reviewed_by = CASE WHEN existing.status = 'pending' OR v_related.status = 'pending' THEN NULL ELSE coalesce(existing.reviewed_by, v_related.reviewed_by) END,
        reviewed_at = CASE WHEN existing.status = 'pending' OR v_related.status = 'pending' THEN NULL ELSE coalesce(existing.reviewed_at, v_related.reviewed_at) END,
        updated_at = now()
      WHERE existing.id = v_existing_id;
      DELETE FROM public.duplicate_review_pairs WHERE id = v_related.id;
    END IF;
  END LOOP;

  DELETE FROM public.duplicate_review_pairs WHERE id = v_pair.id;
  -- Retain the source member row for existing audit foreign keys and identity history.
  UPDATE public.members SET merged_into_member_id = v_survivor.id WHERE id = v_loser.id;
  UPDATE public.members SET merged_into_member_id = v_survivor.id WHERE merged_into_member_id = v_loser.id;

  SELECT to_jsonb(m) INTO v_after FROM public.members m WHERE m.id = v_survivor.id;
  v_after := jsonb_build_object('member', v_after,
    'member_profile', (SELECT to_jsonb(p) FROM public.member_profile p WHERE p.member_id = v_survivor.id LIMIT 1),
    'employment_history', (SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.start_date DESC NULLS LAST), '[]'::jsonb) FROM public.employment_history e WHERE e.member_id = v_survivor.id));
  INSERT INTO public.duplicate_member_merge_audit(pair_id, survivor_id, merged_member_id, merged_by,
    field_sources, before_snapshot, after_snapshot, linked_record_snapshots, moved_record_counts)
  VALUES (v_pair.id, v_survivor.id, v_loser.id, p_admin_id, p_field_sources, v_before, v_after, v_linked, v_counts)
  RETURNING id INTO v_audit_id;

  RETURN jsonb_build_object('auditId', v_audit_id, 'survivorId', v_survivor.id,
    'mergedMemberId', v_loser.id, 'movedRecordCounts', v_counts);
END;
$$;

REVOKE ALL ON FUNCTION public.merge_duplicate_members(uuid, uuid, jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.merge_duplicate_members(uuid, uuid, jsonb, uuid) TO service_role;
