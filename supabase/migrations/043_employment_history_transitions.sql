-- Preserve employment history and keep the current company projection in sync.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.employment_history
    WHERE is_current
    GROUP BY member_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot enforce one current position: some members have multiple current employment rows'
      USING HINT = 'Resolve duplicate current rows, then rerun this migration.';
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS employment_history_one_current_per_member
  ON public.employment_history (member_id)
  WHERE is_current;

CREATE OR REPLACE FUNCTION public.save_member_employment(
  p_member_id uuid,
  p_action text,
  p_company text DEFAULT NULL,
  p_role text DEFAULT NULL,
  p_start_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_current public.employment_history%ROWTYPE;
  v_saved public.employment_history%ROWTYPE;
  v_company_name text;
  v_company_id uuid;
  v_role text;
BEGIN
  IF p_action IS NULL OR p_action NOT IN ('change', 'correct') THEN
    RAISE EXCEPTION 'Action must be change or correct' USING ERRCODE = '22023';
  END IF;
  IF p_action = 'change' AND p_start_date IS NULL THEN
    RAISE EXCEPTION 'A start date is required for a job change' USING ERRCODE = '22023';
  END IF;
  IF p_action = 'change' AND (nullif(btrim(p_company), '') IS NULL OR nullif(btrim(p_role), '') IS NULL) THEN
    RAISE EXCEPTION 'Company and job title are required for a job change' USING ERRCODE = '22023';
  END IF;

  PERFORM 1 FROM public.members WHERE id = p_member_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Member not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_current
  FROM public.employment_history
  WHERE member_id = p_member_id AND is_current
  LIMIT 1
  FOR UPDATE;

  IF p_action = 'change' THEN
    IF v_current.id IS NOT NULL THEN
      IF v_current.start_date IS NOT NULL AND p_start_date < v_current.start_date THEN
        RAISE EXCEPTION 'New job start date cannot be before the current job start date' USING ERRCODE = '22023';
      END IF;
      UPDATE public.employment_history
      SET is_current = false,
          end_date = CASE
            WHEN v_current.start_date IS NOT NULL AND p_start_date = v_current.start_date THEN p_start_date
            ELSE p_start_date - 1
          END
      WHERE id = v_current.id;
    END IF;

    v_company_name := btrim(p_company);
    v_role := btrim(p_role);
    INSERT INTO public.employment_history (member_id, company, role, start_date, end_date, is_current, source)
    VALUES (p_member_id, v_company_name, v_role, p_start_date, NULL, true, 'Manual')
    RETURNING * INTO v_saved;
  ELSE
    v_company_name := coalesce(nullif(btrim(p_company), ''), v_current.company);
    v_role := coalesce(nullif(btrim(p_role), ''), v_current.role);
    IF v_company_name IS NULL OR v_role IS NULL THEN
      RAISE EXCEPTION 'Company and job title are required when no current position exists' USING ERRCODE = '22023';
    END IF;

    IF v_current.id IS NULL THEN
      INSERT INTO public.employment_history (member_id, company, role, start_date, end_date, is_current, source)
      VALUES (p_member_id, v_company_name, v_role, p_start_date, NULL, true, 'Manual')
      RETURNING * INTO v_saved;
    ELSE
      UPDATE public.employment_history
      SET company = v_company_name,
          role = v_role,
          start_date = coalesce(p_start_date, v_current.start_date)
      WHERE id = v_current.id
      RETURNING * INTO v_saved;
    END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(lower(v_saved.company))::bigint);
  SELECT id INTO v_company_id
  FROM public.companies
  WHERE lower(btrim(name)) = lower(v_saved.company)
  ORDER BY id
  LIMIT 1;

  IF v_company_id IS NULL THEN
    INSERT INTO public.companies (name)
    VALUES (v_saved.company)
    RETURNING id INTO v_company_id;
  END IF;

  UPDATE public.member_profile
  SET company_id = v_company_id,
      current_job_start_date = v_saved.start_date::text,
      updated_at = now()
  WHERE member_id = p_member_id;

  IF NOT FOUND THEN
    INSERT INTO public.member_profile (member_id, company_id, current_job_start_date)
    VALUES (p_member_id, v_company_id, v_saved.start_date::text);
  END IF;

  RETURN jsonb_build_object(
    'current', to_jsonb(v_saved),
    'history', (
      SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.start_date DESC NULLS LAST, e.created_at DESC), '[]'::jsonb)
      FROM public.employment_history e
      WHERE e.member_id = p_member_id
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.save_member_employment(uuid, text, text, text, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_member_employment(uuid, text, text, text, date) TO service_role;
