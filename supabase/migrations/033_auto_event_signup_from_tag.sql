-- 033_auto_event_signup_from_tag.sql
--
-- Automatically creates an event_signups row whenever a member gets tagged
-- with an event name that matches a real row in the events table — closing
-- the gap where event_signups had to be manually backfilled twice this
-- session (once for the general OTR pipeline, once for OTR-NYC-2026).
--
-- Fires whenever member_profile.tags changes and detects specifically which
-- tag(s) were newly added (not the whole array, so this doesn't re-fire for
-- tags that were already there). For each newly-added tag, checks whether a
-- matching events.event_name exists — if so, creates a 'registered' signup,
-- guarded against duplicates.
--
-- Deliberately always uses 'registered', not 'attended': at the moment a tag
-- is added, the event may still be upcoming. Marking someone as having
-- actually attended is a separate, later step (same as we did manually for
-- the past OTR-NYC-2026 backfill), not something this trigger can know.

CREATE OR REPLACE FUNCTION sync_event_signup_from_tag()
RETURNS TRIGGER AS $$
DECLARE
  v_old_tags text[];
  v_new_tag text;
  v_event_id uuid;
BEGIN
  v_old_tags := CASE WHEN TG_OP = 'INSERT' THEN ARRAY[]::text[] ELSE COALESCE(OLD.tags, ARRAY[]::text[]) END;

  FOR v_new_tag IN
    SELECT unnest(COALESCE(NEW.tags, ARRAY[]::text[]))
    EXCEPT
    SELECT unnest(v_old_tags)
  LOOP
    SELECT id INTO v_event_id FROM events WHERE event_name = v_new_tag LIMIT 1;

    IF v_event_id IS NOT NULL THEN
      INSERT INTO event_signups (member_id, event_id, rsvp_status, signup_date, created_at)
      SELECT NEW.member_id, v_event_id, 'registered', now(), now()
      WHERE NOT EXISTS (
        SELECT 1 FROM event_signups
        WHERE member_id = NEW.member_id AND event_id = v_event_id
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_event_signup_from_tag ON member_profile;

CREATE TRIGGER trg_sync_event_signup_from_tag
  AFTER INSERT OR UPDATE OF tags ON member_profile
  FOR EACH ROW
  EXECUTE FUNCTION sync_event_signup_from_tag();