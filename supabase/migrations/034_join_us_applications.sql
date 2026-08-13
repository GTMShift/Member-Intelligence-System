-- 034_join_us_applications.sql
--
-- Renames form_responses to join_us_applications (a name that actually
-- describes what it is), and adds the same automatic member-linking
-- behavior we already built for otr_applications: match an incoming
-- submission to an existing member by email, then by LinkedIn URL, and
-- either link them (recording a mismatched email in additional_emails,
-- same as OTR) or create a brand-new member if neither matches.
--
-- Unlike the OTR form, this one also collects company and job title, so a
-- genuinely new member also gets a company match/create and an
-- employment_history row here — the OTR version doesn't need this, since
-- it never collects that data.

ALTER TABLE form_responses RENAME TO join_us_applications;
ALTER TABLE join_us_applications ADD COLUMN member_id uuid REFERENCES members(id);

CREATE OR REPLACE FUNCTION link_join_us_to_member()
RETURNS TRIGGER AS $$
DECLARE
  v_member_id uuid;
  v_existing_email text;
  v_company_id uuid;
BEGIN
  -- Step 1: match by email
  SELECT id, email INTO v_member_id, v_existing_email
  FROM members WHERE email = NEW.email_address LIMIT 1;

  -- Step 2: if no email match, try LinkedIn
  IF v_member_id IS NULL AND NEW.linkedin IS NOT NULL THEN
    SELECT id, email INTO v_member_id, v_existing_email
    FROM members WHERE linkedin_url = NEW.linkedin LIMIT 1;
  END IF;

  IF v_member_id IS NULL THEN
    -- Genuinely new member
    INSERT INTO members (first_name, last_name, email, linkedin_url, phone)
    VALUES (NEW.first_name, NEW.last_name, NEW.email_address, NEW.linkedin, NEW.phone_number)
    RETURNING id INTO v_member_id;

    -- Find or create their company, same case-insensitive matching used elsewhere
    IF NEW.company IS NOT NULL AND trim(NEW.company) != '' THEN
      SELECT id INTO v_company_id FROM companies WHERE lower(name) = lower(trim(NEW.company)) LIMIT 1;
      IF v_company_id IS NULL THEN
        INSERT INTO companies (name) VALUES (trim(NEW.company)) RETURNING id INTO v_company_id;
      END IF;
    END IF;

    INSERT INTO member_profile (member_id, company_id, signup_source)
    VALUES (v_member_id, v_company_id, 'Website');

    IF NEW.job_title IS NOT NULL AND trim(NEW.job_title) != '' THEN
      INSERT INTO employment_history (member_id, company, role, is_current, source)
      VALUES (v_member_id, NEW.company, NEW.job_title, true, 'Join Us form');
    END IF;

    INSERT INTO notifications (type, title, body, member_id, member_name)
    VALUES (
      'new_signup',
      'New member signup',
      NEW.first_name || ' ' || NEW.last_name || ' signed up via the Join Us form and was added to the directory.',
      v_member_id,
      NEW.first_name || ' ' || NEW.last_name
    );
  ELSE
    -- Found an existing member. If they submitted a different email than
    -- what's on file, record it rather than silently losing it.
    IF v_existing_email IS DISTINCT FROM NEW.email_address THEN
      UPDATE member_profile
      SET additional_emails = (
        SELECT ARRAY(
          SELECT DISTINCT unnest(COALESCE(additional_emails, '{}') || ARRAY[NEW.email_address])
        )
      )
      WHERE member_id = v_member_id;
    END IF;
  END IF;

  NEW.member_id = v_member_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_link_join_us_to_member ON join_us_applications;

CREATE TRIGGER trg_link_join_us_to_member
  BEFORE INSERT ON join_us_applications
  FOR EACH ROW
  EXECUTE FUNCTION link_join_us_to_member();