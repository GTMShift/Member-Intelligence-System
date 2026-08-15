-- 037_profile_update_submissions.sql
--
-- Supports the new "memberinfo" Framer form, matching the same submission
-- pattern already used by the OTR form's code overrides: team/region
-- selections are submitted as arrays of readable labels (e.g.
-- "Solutions Engineering/Consulting", "EMEA"), not individual booleans.
-- This trigger translates those labels into member_profile's actual
-- individual oversees_*/region_* boolean columns.
--
-- The Framer form only ever writes into this staging table (public/anon
-- key, same pattern as OTR and Join Us) — it never has direct write access
-- to member_profile itself.

CREATE TABLE profile_update_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES members(id),
  team_size text,
  management_layers text,
  teams_you_oversee text[],
  geographic_scope text[],
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION apply_profile_update_submission()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE member_profile
  SET
    team_size = CASE WHEN NEW.team_size ~ '^\d+$' THEN NEW.team_size::integer ELSE NULL END,
    management_layers = NEW.management_layers,

    oversees_solutions_engineering_consulting =
      'Solutions Engineering/Consulting' = ANY(NEW.teams_you_oversee),
    oversees_value_engineering =
      'Value Engineering' = ANY(NEW.teams_you_oversee),
    oversees_demo_engineering =
      'Demo engineering' = ANY(NEW.teams_you_oversee),
    oversees_enablement =
      'Enablement' = ANY(NEW.teams_you_oversee),
    oversees_professional_services =
      'Professional Services' = ANY(NEW.teams_you_oversee),
    oversees_partnerships_channel_se =
      'Partnerships / Channel SE' = ANY(NEW.teams_you_oversee),
    oversees_forward_deployed_engineering =
      'Forward Deployed Engineering' = ANY(NEW.teams_you_oversee),
    oversees_solutions_architecture =
      'Solutions Architecture' = ANY(NEW.teams_you_oversee),
    oversees_implementation_onboarding =
      'Implementation / Onboarding' = ANY(NEW.teams_you_oversee),
    oversees_customer_success =
      'Customer Success' = ANY(NEW.teams_you_oversee),

    region_global = 'Global' = ANY(NEW.geographic_scope),
    region_north_america = 'North America' = ANY(NEW.geographic_scope),
    region_regional_usa = 'Regional USA' = ANY(NEW.geographic_scope),
    region_emea = 'EMEA' = ANY(NEW.geographic_scope),
    region_apac = 'APAC' = ANY(NEW.geographic_scope),
    region_latin_america = 'Latin America' = ANY(NEW.geographic_scope)
  WHERE member_id = NEW.member_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_apply_profile_update_submission ON profile_update_submissions;

CREATE TRIGGER trg_apply_profile_update_submission
  AFTER INSERT ON profile_update_submissions
  FOR EACH ROW
  EXECUTE FUNCTION apply_profile_update_submission();