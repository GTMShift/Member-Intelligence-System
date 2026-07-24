-- 024_sponsor_requests_and_dietary_sync.sql
--
-- 1. Adds a new text column for the free-text list of sponsors someone wants
--    an intro to, collected via a Stripe Checkout custom field. This is
--    separate from the existing sponsor_intros boolean, which serves a
--    different purpose.
--
-- 2. Adds a trigger that keeps otr_applications.dietary_restrictions and
--    member_profile.dietary_restrictions in sync automatically. Fires on
--    both INSERT and whenever dietary_restrictions or member_id changes —
--    the member_id case matters because dietary_restrictions can be set by
--    the Stripe webhook before or after the application gets linked to a
--    member record, and this ensures the sync catches up either way.

alter table otr_applications add column if not exists sponsor_intro_requests text;

create or replace function sync_otr_dietary_restrictions_to_member_profile()
returns trigger as $$
begin
  if NEW.member_id is not null and NEW.dietary_restrictions is not null then
    update member_profile
    set dietary_restrictions = NEW.dietary_restrictions
    where member_id = NEW.member_id;
  end if;
  return NEW;
end;
$$ language plpgsql;

drop trigger if exists trg_sync_otr_dietary_restrictions on otr_applications;

create trigger trg_sync_otr_dietary_restrictions
  after insert or update of dietary_restrictions, member_id on otr_applications
  for each row
  execute function sync_otr_dietary_restrictions_to_member_profile();

-- 3. Narrow the existing tag-sync trigger (from migration 018) so it only
--    fires when status becomes 'Seat Confirmed', not 'Accepted'. Previously
--    it fired on either status, tagging someone's profile with the event
--    name as soon as they were merely accepted — now it only happens once
--    their seat is actually confirmed (i.e. they've paid).

CREATE OR REPLACE FUNCTION public.sync_otr_tag_to_member()
RETURNS TRIGGER AS $$
DECLARE
    v_event_name TEXT;
BEGIN
    IF NEW.status = 'Seat Confirmed'
       AND NEW.member_id IS NOT NULL
       AND NEW.event_id IS NOT NULL
    THEN
        SELECT event_name INTO v_event_name
        FROM public.events
        WHERE id = NEW.event_id;

        IF v_event_name IS NOT NULL THEN
            UPDATE public.member_profile
            SET tags = (
                SELECT ARRAY(
                    SELECT DISTINCT unnest(
                        COALESCE(tags, '{}') || ARRAY[v_event_name]
                    )
                )
            )
            WHERE member_id = NEW.member_id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;