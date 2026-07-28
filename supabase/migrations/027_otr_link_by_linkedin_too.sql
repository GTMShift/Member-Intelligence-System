-- 027_otr_link_by_linkedin_too.sql
--
-- Fixes a real bug: link_otr_to_member only matched existing members by
-- email. If someone applies to OTR using a different email than the one
-- already on file (e.g. work vs personal), the trigger couldn't find them,
-- tried to create a brand new member, and hit the unique constraint on
-- linkedin_url — which rolled back the ENTIRE transaction, including the
-- otr_applications row itself. This is why the Framer submission appeared
-- to vanish with no trace.
--
-- Fix: also check for an existing member by linkedin_url before deciding to
-- create a new one. If found via either email or LinkedIn, and the OTR
-- email differs from their primary email, record it in
-- member_profile.additional_emails instead of silently losing it.

CREATE OR REPLACE FUNCTION public.link_otr_to_member()
RETURNS TRIGGER AS $$
DECLARE
    v_member_id UUID;
    v_existing_email TEXT;
    v_dup_member_id UUID;
    v_matched_on TEXT;
BEGIN
    -- Step 1: try matching by email first
    SELECT id, email INTO v_member_id, v_existing_email
    FROM public.members
    WHERE email = NEW.email
    LIMIT 1;

    -- Step 2: if no email match, try matching by LinkedIn URL instead
    IF v_member_id IS NULL AND NEW.linkedin IS NOT NULL THEN
        SELECT id, email INTO v_member_id, v_existing_email
        FROM public.members
        WHERE linkedin_url = NEW.linkedin
        LIMIT 1;
    END IF;

    IF v_member_id IS NULL THEN
        -- Genuinely new member — no existing match by either signal
        INSERT INTO public.members (
            first_name, last_name, email, linkedin_url, phone
        )
        VALUES (
            NEW.first_name, NEW.last_name, NEW.email, NEW.linkedin, NEW.phone_number
        )
        RETURNING id INTO v_member_id;

        INSERT INTO public.member_profile (member_id, signup_source)
        VALUES (v_member_id, 'OTR');

        INSERT INTO public.notifications (type, title, body, member_id, member_name)
        VALUES (
            'new_signup',
            'New member signup',
            NEW.first_name || ' ' || NEW.last_name || ' applied via the OTR form and was added to the directory.',
            v_member_id,
            NEW.first_name || ' ' || NEW.last_name
        );

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
    ELSE
        -- Found an existing member via email or LinkedIn. If they applied
        -- with a different email than the one on file, capture it rather
        -- than silently losing it.
        IF v_existing_email IS DISTINCT FROM NEW.email THEN
            UPDATE public.member_profile
            SET additional_emails = (
                SELECT ARRAY(
                    SELECT DISTINCT unnest(COALESCE(additional_emails, '{}') || ARRAY[NEW.email])
                )
            )
            WHERE member_id = v_member_id;
        END IF;
    END IF;

    NEW.member_id = v_member_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;