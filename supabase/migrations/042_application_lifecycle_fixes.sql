-- 042: fixes found while testing 041 on a Supabase preview branch.
--
-- 1. Applications that already created or linked a member before 041 are
--    marked approved instead of reappearing in the review queue.
-- 2. New submissions always start pending and unlinked, whatever the client
--    sends (the public form inserts with the anon key).
-- 3. A decided application cannot be flipped to another decision. This
--    matches the API, which only decides pending applications.
-- 4. Approvals that cannot be completed fail with a clear message instead of
--    a raw constraint error: no email, no LinkedIn for a brand-new member, or
--    a member record that is already linked to a different login.
-- 5. A sign-in after approval never fails because the approved member record
--    is already linked to another login; the account stays an applicant.
-- 6. The approval and sign-in functions get a fixed search_path.
-- 7. notifications.member_name exists in production but no migration adds it
--    (016 declares it with CREATE TABLE IF NOT EXISTS after 006 created the
--    table), so approvals failed on a fresh replay. Add it if missing.
-- 8. Unlinked applicants can submit a member access request (039 only allowed
--    unlinked 'member' accounts, which 041 no longer creates).
--
-- Existing directory members are intentionally NOT linked by email at sign-in
-- (see docs/security/database_access.md). They get access through an approved
-- Join Us application, which links them to their existing member record.

BEGIN;

-- 7. Needed by the approval trigger's notification insert. No-op in production.
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS member_name text;

-- 1. Backfill: rows linked before 041 were already handled by the old
--    auto-create flow. Disable the approval triggers so the backfill only sets
--    the status and does not re-run member matching or profile updates.
ALTER TABLE public.join_us_applications DISABLE TRIGGER trg_link_approved_join_us_to_member;
ALTER TABLE public.join_us_applications DISABLE TRIGGER trg_grant_member_access_for_approved_application;

UPDATE public.join_us_applications
SET status = 'approved'
WHERE member_id IS NOT NULL
  AND status = 'pending'
  AND reviewed_at IS NULL;

ALTER TABLE public.join_us_applications ENABLE TRIGGER trg_link_approved_join_us_to_member;
ALTER TABLE public.join_us_applications ENABLE TRIGGER trg_grant_member_access_for_approved_application;

-- 2. New submissions start pending and unlinked.
CREATE OR REPLACE FUNCTION public.force_new_join_us_application_pending()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  NEW.status := 'pending';
  NEW.member_id := NULL;
  NEW.reviewed_by := NULL;
  NEW.reviewed_at := NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_force_new_join_us_application_pending ON public.join_us_applications;
CREATE TRIGGER trg_force_new_join_us_application_pending
BEFORE INSERT ON public.join_us_applications
FOR EACH ROW EXECUTE FUNCTION public.force_new_join_us_application_pending();

-- The public form inserts with the anon key. The hosted project has an anon
-- INSERT policy that was created outside migrations with WITH CHECK (true).
-- Limit it to new, unreviewed rows (defense in depth alongside the trigger),
-- and create it on fresh replays so they match the hosted project.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'join_us_applications'
      AND policyname = 'Enable insert for anon users'
  ) THEN
    ALTER POLICY "Enable insert for anon users" ON public.join_us_applications
      WITH CHECK (
        status = 'pending'
        AND member_id IS NULL
        AND reviewed_by IS NULL
        AND reviewed_at IS NULL
      );
  ELSE
    CREATE POLICY "Enable insert for anon users" ON public.join_us_applications
      FOR INSERT TO anon
      WITH CHECK (
        status = 'pending'
        AND member_id IS NULL
        AND reviewed_by IS NULL
        AND reviewed_at IS NULL
      );
  END IF;
END $$;
GRANT INSERT ON public.join_us_applications TO anon;

-- 3. Only pending applications can be decided.
CREATE OR REPLACE FUNCTION public.enforce_join_us_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND OLD.status <> 'pending' THEN
    RAISE EXCEPTION 'Only pending applications can be approved or rejected';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_join_us_status_transition ON public.join_us_applications;
-- Named to sort before trg_link_approved_join_us_to_member, so it runs first.
CREATE TRIGGER trg_enforce_join_us_status_transition
BEFORE UPDATE OF status ON public.join_us_applications
FOR EACH ROW EXECUTE FUNCTION public.enforce_join_us_status_transition();

-- 4a. Create or link the member on approval, with clear errors.
CREATE OR REPLACE FUNCTION public.link_approved_join_us_to_member()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_email text := nullif(trim(NEW.email_address), '');
  v_linkedin text := nullif(trim(NEW.linkedin), '');
  v_email_member_id uuid;
  v_linkedin_member_id uuid;
  v_member_id uuid;
  v_company_id uuid;
BEGIN
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'Email address is required to approve a Join Us application';
  END IF;

  -- Check both identifiers independently before linking anything.
  SELECT id INTO v_email_member_id
  FROM public.members
  WHERE lower(email) = lower(v_email)
  LIMIT 1;

  IF v_linkedin IS NOT NULL THEN
    SELECT id INTO v_linkedin_member_id
    FROM public.members
    WHERE lower(linkedin_url) = lower(v_linkedin)
    LIMIT 1;
  END IF;

  -- Never merge two different existing members automatically.
  IF v_email_member_id IS NOT NULL
    AND v_linkedin_member_id IS NOT NULL
    AND v_email_member_id <> v_linkedin_member_id THEN
    RAISE EXCEPTION
      'Ambiguous member match: email and LinkedIn belong to different members';
  END IF;

  v_member_id := COALESCE(v_email_member_id, v_linkedin_member_id);

  -- No existing match means approval creates the new member.
  IF v_member_id IS NULL THEN
    -- members.linkedin_url is required and unique.
    IF v_linkedin IS NULL THEN
      RAISE EXCEPTION 'LinkedIn URL is required to create a new member from a Join Us application';
    END IF;

    INSERT INTO public.members (first_name, last_name, email, linkedin_url, phone)
    VALUES (NEW.first_name, NEW.last_name, v_email, v_linkedin, NEW.phone_number)
    RETURNING id INTO v_member_id;

    IF NEW.company IS NOT NULL AND trim(NEW.company) <> '' THEN
      SELECT id INTO v_company_id
      FROM public.companies
      WHERE lower(name) = lower(trim(NEW.company))
      LIMIT 1;

      IF v_company_id IS NULL THEN
        INSERT INTO public.companies (name)
        VALUES (trim(NEW.company))
        RETURNING id INTO v_company_id;
      END IF;
    END IF;

    INSERT INTO public.member_profile (member_id, company_id, signup_source)
    VALUES (v_member_id, v_company_id, 'Website');

    IF NEW.job_title IS NOT NULL AND trim(NEW.job_title) <> '' THEN
      INSERT INTO public.employment_history (member_id, company, role, is_current, source)
      VALUES (v_member_id, NEW.company, NEW.job_title, true, 'Website');
    END IF;

    INSERT INTO public.notifications (type, title, body, member_id, member_name)
    VALUES (
      'new_signup',
      'New member approved',
      NEW.first_name || ' ' || NEW.last_name ||
        ' was approved from the Join Us form and added to the directory.',
      v_member_id,
      NEW.first_name || ' ' || NEW.last_name
    );
  END IF;

  NEW.member_id := v_member_id;
  RETURN NEW;
END;
$$;

-- 4b. Grant member access on approval. An admin keeps their role (041), and a
--     member record that already belongs to a different login stops the
--     approval with a clear message instead of a unique-constraint error.
CREATE OR REPLACE FUNCTION public.grant_member_access_for_approved_application()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.member_id = NEW.member_id
      AND lower(p.email) <> lower(trim(NEW.email_address))
  ) THEN
    RAISE EXCEPTION 'Member record is already linked to a different login';
  END IF;

  UPDATE public.profiles
  SET
    role = 'member',
    member_id = NEW.member_id,
    updated_at = now()
  WHERE lower(email) = lower(trim(NEW.email_address))
    AND role = 'applicant';

  RETURN NEW;
END;
$$;

-- 5. Link at first sign-in after approval, without ever failing the sign-in.
CREATE OR REPLACE FUNCTION public.link_new_profile_to_approved_member()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  approved_member_id uuid;
BEGIN
  IF NEW.role = 'admin' THEN
    RETURN NEW;
  END IF;

  SELECT j.member_id
  INTO approved_member_id
  FROM public.join_us_applications j
  WHERE j.status = 'approved'
    AND j.member_id IS NOT NULL
    AND lower(trim(j.email_address)) = lower(NEW.email)
  ORDER BY j.reviewed_at DESC NULLS LAST, j.created_at DESC
  LIMIT 1;

  IF approved_member_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.profiles p WHERE p.member_id = approved_member_id
    ) THEN
    NEW.role := 'member';
    NEW.member_id := approved_member_id;
  END IF;

  RETURN NEW;
END;
$$;

-- 6. handle_new_user is SECURITY DEFINER; pin its search_path.
ALTER FUNCTION public.handle_new_user() SET search_path = pg_catalog, public;

-- 8. 039's access requests only accepted unlinked 'member' accounts. After 041
--    every new sign-in is an 'applicant', so nobody new could submit one.
--    Accept unlinked applicants as well. Body otherwise unchanged from 039.
create or replace function public.submit_my_member_access_request(p_data jsonb)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text;
  v_role text;
  v_member_id uuid;
  v_request_id uuid;
  v_allowed_keys text[] := array[
    'first_name', 'last_name', 'linkedin_url', 'phone', 'job_title',
    'current_job_start_date', 'seniority_level', 'company_name', 'team_size',
    'management_layers', 'event_interest', 'address', 'city', 'state_region',
    'zip_code', 'country', 'tshirt_size', 'dietary_restrictions', 'socials',
    'oversees_customer_success', 'oversees_demo_engineering', 'oversees_enablement',
    'oversees_forward_deployed_engineering', 'oversees_implementation_onboarding',
    'oversees_partnerships_channel_se', 'oversees_professional_services',
    'oversees_solutions_architecture', 'oversees_solutions_engineering_consulting',
    'oversees_value_engineering', 'oversees_other', 'oversees_other_text',
    'region_north_america', 'region_regional_usa', 'region_global', 'region_emea',
    'region_apac', 'region_latin_america'
  ];
begin
  if v_user_id is null then
    raise exception 'An authenticated account is required';
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'The submitted profile details are invalid';
  end if;
  if octet_length(p_data::text) > 50000 or (p_data - v_allowed_keys) <> '{}'::jsonb then
    raise exception 'The submitted profile details are invalid';
  end if;

  select p.email, p.role, p.member_id
    into v_email, v_role, v_member_id
    from public.profiles p
   where p.id = v_user_id;
  -- After 041, new sign-ins are applicants, so unlinked applicants can submit too.
  if not found or v_role not in ('member', 'applicant') or v_member_id is not null then
    raise exception 'Only an unlinked account can submit an access request';
  end if;
  if nullif(btrim(p_data->>'first_name'), '') is null
     or nullif(btrim(p_data->>'last_name'), '') is null then
    raise exception 'First name and last name are required';
  end if;
  if p_data ? 'email' then
    raise exception 'Email is taken from the signed-in account';
  end if;
  if p_data ? 'socials' and jsonb_typeof(p_data->'socials') <> 'array' then
    raise exception 'Social links must be an array';
  end if;

  insert into public.member_access_requests(auth_user_id, email, submitted_data)
  values (v_user_id, coalesce(v_email, ''), p_data)
  on conflict (auth_user_id) where status = 'pending'
  do update set email = excluded.email,
                submitted_data = excluded.submitted_data,
                submitted_at = now()
  returning id into v_request_id;

  return v_request_id;
end;
$$;
revoke all on function public.submit_my_member_access_request(jsonb) from public, anon;
grant execute on function public.submit_my_member_access_request(jsonb) to authenticated;

REVOKE ALL ON FUNCTION public.force_new_join_us_application_pending() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_join_us_status_transition() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.link_approved_join_us_to_member() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.grant_member_access_for_approved_application() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.link_new_profile_to_approved_member() FROM public, anon, authenticated;

COMMIT;
