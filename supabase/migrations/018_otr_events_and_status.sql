-- ============================================================
-- Migration 018: OTR Status, Tags, and Event Linking
-- ============================================================
-- Run this in the Supabase SQL editor (public schema only).
-- ============================================================


-- ============================================================
-- EVENTS TABLE — add missing columns only
-- ============================================================

ALTER TABLE public.events
    ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'upcoming'
        CHECK (status IN ('upcoming', 'active', 'closed', 'completed'));

ALTER TABLE public.events
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();


-- ============================================================
-- OTR_APPLICATIONS — new columns
-- ============================================================

-- Link to which event this application is for
ALTER TABLE public.otr_applications
    ADD COLUMN IF NOT EXISTS event_id UUID REFERENCES public.events(id);

-- Application status
ALTER TABLE public.otr_applications
    ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Pending'
        CHECK (status IN (
            'Pending',
            'Accepted',
            'Waitlisted',
            'Denied',
            'Seat Confirmed',
            'Withdrawn',
            'Welcome Reception Only',
            'Confirmed'
        ));

-- Event-specific details collected via Stripe
ALTER TABLE public.otr_applications
    ADD COLUMN IF NOT EXISTS dietary_restrictions TEXT;

ALTER TABLE public.otr_applications
    ADD COLUMN IF NOT EXISTS is_speaker BOOLEAN DEFAULT false;

ALTER TABLE public.otr_applications
    ADD COLUMN IF NOT EXISTS welcome_reception BOOLEAN DEFAULT false;

ALTER TABLE public.otr_applications
    ADD COLUMN IF NOT EXISTS sponsor_intros BOOLEAN DEFAULT false;

-- Optional link to members table if applicant is also a member
ALTER TABLE public.otr_applications
    ADD COLUMN IF NOT EXISTS member_id UUID REFERENCES public.members(id);


-- ============================================================
-- TRIGGER
-- When an application status is set to Accepted or Seat Confirmed
-- and the applicant has a linked member_id, automatically look up
-- the event name from the events table and append it to
-- member_profile.tags. Deduplicates so the same tag is never
-- added twice.
--
-- Example: member_profile.tags goes from
--   {"Luma"}
-- to
--   {"Luma", "OTR-SC-2026"}
-- ============================================================

CREATE OR REPLACE FUNCTION public.sync_otr_tag_to_member()
RETURNS TRIGGER AS $$
DECLARE
    v_event_name TEXT;
BEGIN
    IF NEW.status IN ('Accepted', 'Seat Confirmed')
       AND NEW.member_id IS NOT NULL
       AND NEW.event_id IS NOT NULL
    THEN
        -- Look up the event name from the events table
        SELECT event_name INTO v_event_name
        FROM public.events
        WHERE id = NEW.event_id;

        -- Only proceed if we found an event name
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

DROP TRIGGER IF EXISTS trg_sync_otr_tag ON public.otr_applications;

CREATE TRIGGER trg_sync_otr_tag
    AFTER INSERT OR UPDATE OF status ON public.otr_applications
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_otr_tag_to_member();


-- ============================================================
-- TRIGGER — auto-link new OTR application to existing member
-- Runs before insert. If the applicant's email matches a row
-- in the members table, member_id is set automatically.
-- If no match is found, member_id stays null (not an error).
-- ============================================================

CREATE OR REPLACE FUNCTION public.link_otr_to_member()
RETURNS TRIGGER AS $$
BEGIN
    SELECT id INTO NEW.member_id
    FROM public.members
    WHERE email = NEW.email
    LIMIT 1;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_link_otr_to_member ON public.otr_applications;

CREATE TRIGGER trg_link_otr_to_member
    BEFORE INSERT ON public.otr_applications
    FOR EACH ROW
    EXECUTE FUNCTION public.link_otr_to_member();


-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_otr_event_id  ON public.otr_applications(event_id);
CREATE INDEX IF NOT EXISTS idx_otr_status    ON public.otr_applications(status);
CREATE INDEX IF NOT EXISTS idx_otr_member_id ON public.otr_applications(member_id);
CREATE INDEX IF NOT EXISTS idx_events_status ON public.events(status);