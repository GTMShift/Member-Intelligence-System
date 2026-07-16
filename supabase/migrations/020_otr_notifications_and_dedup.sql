-- 020_otr_notifications_and_dedup.sql
--
-- Extends link_otr_to_member() (from migration 019) so that when a NEW
-- member is auto-created from an OTR application (no existing email match),
-- it also:
--   1. Creates a new_signup notification, matching what self-signup and
--      admin-created members already do in the frontend
--   2. Checks the new member's LinkedIn URL and phone against all OTHER
--      existing members (email is already excluded by definition — a match
--      there means we linked instead of creating) and, if found, creates a
--      duplicate_flags row + a duplicate_detected notification for review
--
-- This keeps OTR-sourced members consistent with self-signup/admin-created
-- members, which otherwise wouldn't get notifications or dedup checks since
-- this trigger runs entirely in the database, with no frontend code involved.

CREATE OR REPLACE FUNCTION public.link_otr_to_member()
RETURNS TRIGGER AS $$
DECLARE
    v_member_id UUID;
    v_dup_member_id UUID;
    v_matched_on TEXT;
BEGIN
    SELECT id INTO v_member_id
    FROM public.members
    WHERE email = NEW.email
    LIMIT 1;

    IF v_member_id IS NULL THEN
        INSERT INTO public.members (
            first_name, last_name, email, linkedin_url, phone
        )
        VALUES (
            NEW.first_name, NEW.last_name, NEW.email, NEW.linkedin, NEW.phone_number
        )
        RETURNING id INTO v_member_id;

        INSERT INTO public.member_profile (member_id, signup_source)
        VALUES (v_member_id, 'OTR');

        -- New signup notification
        INSERT INTO public.notifications (type, title, body, member_id, member_name)
        VALUES (
            'new_signup',
            'New member signup',
            NEW.first_name || ' ' || NEW.last_name || ' applied via the OTR form and was added to the directory.',
            v_member_id,
            NEW.first_name || ' ' || NEW.last_name
        );

        -- Duplicate check: LinkedIn first, then phone (email already
        -- excluded — a match there means we'd have linked, not created)
        IF NEW.linkedin IS NOT NULL THEN
            SELECT id INTO v_dup_member_id
            FROM public.members
            WHERE linkedin_url = NEW.linkedin AND id != v_member_id
            LIMIT 1;
            IF v_dup_member_id IS NOT NULL THEN
                v_matched_on := 'linkedin_url';
            END IF;
        END IF;

        IF v_dup_member_id IS NULL AND NEW.phone_number IS NOT NULL THEN
            SELECT id INTO v_dup_member_id
            FROM public.members
            WHERE phone = NEW.phone_number AND id != v_member_id
            LIMIT 1;
            IF v_dup_member_id IS NOT NULL THEN
                v_matched_on := 'phone';
            END IF;
        END IF;

        IF v_dup_member_id IS NOT NULL THEN
            INSERT INTO public.duplicate_flags (
                incoming_first_name, incoming_last_name, incoming_email,
                incoming_linkedin_url, incoming_phone, incoming_current_role,
                existing_member_id, matched_on
            )
            VALUES (
                NEW.first_name, NEW.last_name, NEW.email,
                NEW.linkedin, NEW.phone_number, NULL,
                v_dup_member_id, v_matched_on
            );

            INSERT INTO public.notifications (type, title, body, member_id, member_name)
            VALUES (
                'duplicate_detected',
                'Possible duplicate member detected',
                'A new OTR signup for "' || NEW.first_name || ' ' || NEW.last_name ||
                    '" matches an existing member on ' || replace(v_matched_on, '_', ' ') || '. Review before merging.',
                v_member_id,
                NEW.first_name || ' ' || NEW.last_name
            );
        END IF;
    END IF;

    NEW.member_id = v_member_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger already exists (from migration 018/019) and references this
-- function by name, so no need to recreate it here.