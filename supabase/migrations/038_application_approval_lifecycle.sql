BEGIN;

-- Every new Join Us submission starts awaiting an admin decision.
ALTER TABLE join_us_applications
ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending'
CHECK (status IN ('pending', 'approved', 'rejected'));

-- Keep an audit trail of who made an approval decision and when.
ALTER TABLE join_us_applications
ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES profiles(id),
ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

-- Stop form submission from automatically creating or linking a member.
DROP TRIGGER IF EXISTS trg_link_join_us_to_member
ON join_us_applications;

-- Allow applicant profiles and make new non-admin profiles applicants by default.
ALTER TABLE profiles
DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE profiles
ADD CONSTRAINT profiles_role_check
CHECK (role IN ('admin', 'member', 'applicant'));

ALTER TABLE profiles
ALTER COLUMN role SET DEFAULT 'applicant';

-- New Google sign-ins start as applicants. The approved-application
-- trigger below is the only path that upgrades them to member.
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url, role)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url',
    'applicant'
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create or link a member only when an application is approved.
CREATE TRIGGER trg_link_approved_join_us_to_member
BEFORE UPDATE OF status ON join_us_applications
FOR EACH ROW
WHEN (
  OLD.status IS DISTINCT FROM 'approved'
  AND NEW.status = 'approved'
)
EXECUTE FUNCTION link_join_us_to_member();

-- If the approved applicant already has a profile, grant member access.
CREATE OR REPLACE FUNCTION grant_member_access_for_approved_application()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE profiles
  SET
    role = 'member',
    member_id = NEW.member_id,
    updated_at = now()
  WHERE lower(email) = lower(NEW.email_address);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_grant_member_access_for_approved_application
AFTER UPDATE OF status ON join_us_applications
FOR EACH ROW
WHEN (
  OLD.status IS DISTINCT FROM 'approved'
  AND NEW.status = 'approved'
)
EXECUTE FUNCTION grant_member_access_for_approved_application();

-- If approval happens before the applicant first signs in, grant access
-- when their profile is created later.
CREATE OR REPLACE FUNCTION link_new_profile_to_approved_member()
RETURNS TRIGGER AS $$
DECLARE
  approved_member_id UUID;
BEGIN
  IF NEW.role = 'admin' THEN
    RETURN NEW;
  END IF;

  SELECT member_id
  INTO approved_member_id
  FROM join_us_applications
  WHERE status = 'approved'
    AND member_id IS NOT NULL
    AND lower(email_address) = lower(NEW.email)
  LIMIT 1;

  IF approved_member_id IS NOT NULL THEN
    NEW.role = 'member';
    NEW.member_id = approved_member_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_link_new_profile_to_approved_member
BEFORE INSERT ON profiles
FOR EACH ROW
EXECUTE FUNCTION link_new_profile_to_approved_member();

COMMIT;