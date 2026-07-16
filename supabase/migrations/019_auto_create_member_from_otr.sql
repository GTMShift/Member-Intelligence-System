-- ============================================================
-- Migration 01: Auto-create member from OTR application
-- ============================================================
-- When a new OTR application comes in:
--   1. If the email already exists in members → link to that member
--   2. If the email does not exist → create a new member +
--      member_profile row, then link to the new member
--
-- Also adds "OTR" as a valid signup_source on member_profile.
-- ============================================================


-- ============================================================
-- Add "OTR" to signup_source on member_profile
-- Drops and recreates the check constraint to include OTR.
-- If there is no existing check constraint on signup_source,
-- the DROP will do nothing and the ADD will still work.
-- ============================================================

ALTER TABLE public.member_profile
    DROP CONSTRAINT IF EXISTS member_profile_signup_source_check;

ALTER TABLE public.member_profile
    ADD CONSTRAINT member_profile_signup_source_check
        CHECK (signup_source IN (
            'Website',
            'Luma',
            'Substack',
            'Manual',
            'OTR'
        ));


-- ============================================================
-- Replace the existing link_otr_to_member trigger function
-- with one that also creates a member if none is found.
-- ============================================================

CREATE OR REPLACE FUNCTION public.link_otr_to_member()
RETURNS TRIGGER AS $$
DECLARE
    v_member_id UUID;
BEGIN
    -- Step 1: Check if a member with this email already exists
    SELECT id INTO v_member_id
    FROM public.members
    WHERE email = NEW.email
    LIMIT 1;

    -- Step 2: If no match found, create a new member + profile
    IF v_member_id IS NULL THEN

        -- Insert into members table
        INSERT INTO public.members (
            first_name,
            last_name,
            email,
            linkedin_url,
            phone
        )
        VALUES (
            NEW.first_name,
            NEW.last_name,
            NEW.email,
            NEW.linkedin,
            NEW.phone_number
        )
        RETURNING id INTO v_member_id;

        -- Insert into member_profile table
        INSERT INTO public.member_profile (
            member_id,
            signup_source
        )
        VALUES (
            v_member_id,
            'OTR'
        );

    END IF;

    -- Step 3: Set member_id on the OTR application either way
    NEW.member_id = v_member_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger already exists from migration 002 — no need to recreate it.
-- The function replacement above is enough since the trigger
-- references the function by name.