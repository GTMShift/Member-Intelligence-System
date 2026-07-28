-- 028_normalize_otr_linkedin.sql
--
-- The OTR application form (Framer) doesn't go through the same
-- normalizeLinkedInUrl() logic our own React forms use, so linkedin values
-- have arrived inconsistently formatted (some with https://, some with
-- www., some with neither). This trigger normalizes every value to
-- https://www.<rest of url> going forward, matching the format used
-- everywhere else in the app (e.g. members.linkedin_url).

CREATE OR REPLACE FUNCTION normalize_otr_linkedin_url()
RETURNS TRIGGER AS $$
DECLARE
  v_url TEXT;
BEGIN
  IF NEW.linkedin IS NOT NULL AND NEW.linkedin != '' THEN
    v_url := trim(NEW.linkedin);
    -- Strip any existing http:// or https:// prefix
    v_url := regexp_replace(v_url, '^https?://', '', 'i');
    -- Ensure a www. prefix
    IF v_url !~* '^www\.' THEN
      v_url := 'www.' || v_url;
    END IF;
    NEW.linkedin := 'https://' || v_url;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_normalize_otr_linkedin ON otr_applications;

CREATE TRIGGER trg_normalize_otr_linkedin
  BEFORE INSERT OR UPDATE OF linkedin ON otr_applications
  FOR EACH ROW
  EXECUTE FUNCTION normalize_otr_linkedin_url();

-- Backfill: re-save every existing row so the trigger normalizes it too.
-- (Only fires the trigger's UPDATE OF linkedin condition when the value
-- actually differs, but this SET is safe to run unconditionally.)
UPDATE otr_applications SET linkedin = linkedin WHERE linkedin IS NOT NULL;