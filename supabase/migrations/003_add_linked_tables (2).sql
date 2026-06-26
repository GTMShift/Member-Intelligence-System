-- ============================================================
-- GTMShift Member Intelligence Platform
-- Migration 003: Linked Tables
-- ============================================================
-- Approved by James Kaikis. Run AFTER 001 and 002.
--
-- This migration:
-- 1. Adds new fields to members table
-- 2. Creates employment_history (replaces prev_company cols)
-- 3. Creates events and event_signups
-- 4. Creates newsletter_engagement
-- 5. Creates enrichment_runs
-- 6. Drops old prev_company/prev_role columns from member_profile
-- ============================================================


-- ============================================================
-- UPDATE MEMBERS TABLE
-- Add fields from Vivaan's outline that were missing
-- ============================================================
ALTER TABLE members
    ADD COLUMN IF NOT EXISTS enriched_at          TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS record_source        TEXT CHECK (record_source IN ('Framer', 'Luma', 'Substack', 'Manual')),
    ADD COLUMN IF NOT EXISTS subscription_status  TEXT,
    ADD COLUMN IF NOT EXISTS signup_date          TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_engagement_date TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS engagement_score     NUMERIC;


-- ============================================================
-- EMPLOYMENT HISTORY TABLE
-- Replaces prev_company_1/2/3 columns on member_profile.
-- One row per job. Unlimited rows per member.
-- ============================================================
CREATE TABLE employment_history (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id   UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    company     TEXT NOT NULL,
    role        TEXT,
    start_date  DATE,
    end_date    DATE,
    source      TEXT NOT NULL CHECK (source IN ('Apollo', 'Manual', 'Import')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_employment_member ON employment_history(member_id);


-- ============================================================
-- EVENTS TABLE
-- One row per event. Sourced from Luma.
-- ============================================================
CREATE TABLE events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    luma_event_id   TEXT UNIQUE,
    event_name      TEXT NOT NULL,
    event_date      TIMESTAMPTZ NOT NULL,
    event_type      TEXT NOT NULL,
    capacity        INTEGER,
    location        TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_events_date ON events(event_date);


-- ============================================================
-- EVENT_SIGNUPS TABLE
-- Join table between members and events.
-- Tracks RSVP status, event goal, and approval.
-- ============================================================
CREATE TABLE event_signups (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id       UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    event_id        UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    rsvp_status     TEXT NOT NULL CHECK (rsvp_status IN ('registered', 'attended', 'no_show', 'canceled')),
    signup_date     TIMESTAMPTZ,
    event_goal      TEXT,
    approval_status TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_member_event UNIQUE (member_id, event_id)
);

CREATE INDEX idx_signups_member ON event_signups(member_id);
CREATE INDEX idx_signups_event  ON event_signups(event_id);


-- ============================================================
-- NEWSLETTER_ENGAGEMENT TABLE
-- Tracks Substack opens and clicks per member.
-- One row per engagement event.
-- ============================================================
CREATE TABLE newsletter_engagement (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id       UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    engagement_type TEXT NOT NULL CHECK (engagement_type IN ('open', 'click')),
    issue_title     TEXT,
    engaged_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_newsletter_member ON newsletter_engagement(member_id);


-- ============================================================
-- ENRICHMENT_RUNS TABLE
-- Tracks every Apollo enrichment attempt per member.
-- Records what fields changed, whether it succeeded, and when.
-- ============================================================
CREATE TABLE enrichment_runs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id       UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    run_type        TEXT NOT NULL CHECK (run_type IN ('initial', 'scheduled', 'manual')),
    status          TEXT NOT NULL CHECK (status IN ('success', 'failed', 'partial')),
    fields_updated  JSONB,
    fields_skipped  JSONB,
    error_message   TEXT,
    ran_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_enrichment_member ON enrichment_runs(member_id);


-- ============================================================
-- DROP OLD PREV COMPANY/ROLE COLUMNS FROM MEMBER_PROFILE
-- Replaced by employment_history table
-- ============================================================
ALTER TABLE member_profile
    DROP COLUMN IF EXISTS prev_company_1,
    DROP COLUMN IF EXISTS prev_role_1,
    DROP COLUMN IF EXISTS prev_company_2,
    DROP COLUMN IF EXISTS prev_role_2,
    DROP COLUMN IF EXISTS prev_company_3,
    DROP COLUMN IF EXISTS prev_role_3;
