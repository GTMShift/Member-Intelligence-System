-- 035_backfill_join_us_applications.sql
--
-- One-time backfill for the 24 join_us_applications rows created before
-- the link_join_us_to_member trigger existed, so member_id was never set
-- for them. Mirrors the exact same logic the trigger now uses going
-- forward: match by email, then by LinkedIn URL, and only create a
-- genuinely new member (with company + employment history) if neither
-- matches.

DO $$
DECLARE
  r RECORD;
  v_member_id uuid;
  v_existing_email text;
  v_company_id uuid;
BEGIN
  FOR r IN SELECT * FROM join_us_applications WHERE member_id IS NULL LOOP
    v_member_id := NULL;
    v_existing_email := NULL;
    v_company_id := NULL;

    -- Step 1: match by email
    SELECT id, email INTO v_member_id, v_existing_email
    FROM members WHERE email = r.email_address LIMIT 1;

    -- Step 2: if no email match, try LinkedIn
    IF v_member_id IS NULL AND r.linkedin IS NOT NULL THEN
      SELECT id, email INTO v_member_id, v_existing_email
      FROM members WHERE linkedin_url = r.linkedin LIMIT 1;
    END IF;

    IF v_member_id IS NULL THEN
      -- Genuinely new member
      INSERT INTO members (first_name, last_name, email, linkedin_url, phone)
      VALUES (r.first_name, r.last_name, r.email_address, r.linkedin, r.phone_number)
      RETURNING id INTO v_member_id;

      IF r.company IS NOT NULL AND trim(r.company) != '' THEN
        SELECT id INTO v_company_id FROM companies WHERE lower(name) = lower(trim(r.company)) LIMIT 1;
        IF v_company_id IS NULL THEN
          INSERT INTO companies (name) VALUES (trim(r.company)) RETURNING id INTO v_company_id;
        END IF;
      END IF;

      INSERT INTO member_profile (member_id, company_id, signup_source)
      VALUES (v_member_id, v_company_id, 'Website');

      IF r.job_title IS NOT NULL AND trim(r.job_title) != '' THEN
        INSERT INTO employment_history (member_id, company, role, is_current, source)
        VALUES (v_member_id, r.company, r.job_title, true, 'Website');
      END IF;

      INSERT INTO notifications (type, title, body, member_id, member_name)
      VALUES (
        'new_signup',
        'New member signup',
        r.first_name || ' ' || r.last_name || ' signed up via the Join Us form and was added to the directory.',
        v_member_id,
        r.first_name || ' ' || r.last_name
      );
    ELSE
      IF v_existing_email IS DISTINCT FROM r.email_address THEN
        UPDATE member_profile
        SET additional_emails = (
          SELECT ARRAY(SELECT DISTINCT unnest(COALESCE(additional_emails, '{}') || ARRAY[r.email_address]))
        )
        WHERE member_id = v_member_id;
      END IF;
    END IF;

    UPDATE join_us_applications SET member_id = v_member_id WHERE id = r.id;
  END LOOP;
END $$;