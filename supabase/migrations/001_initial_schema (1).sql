-- ============================================================
-- GTMShift Member Intelligence Platform
-- Migration 001: Initial Schema
-- ============================================================
-- Run this in Supabase SQL editor to set up the database.
-- Never make manual changes in the dashboard without adding
-- a new migration file to match.
-- ============================================================


-- ============================================================
-- MEMBERS TABLE
-- Core identity. Every member has these.
-- Unique identifier: linkedin_url + email (from meeting notes)
-- ============================================================
CREATE TABLE members (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    first_name      TEXT NOT NULL,
    last_name       TEXT NOT NULL,
    email           TEXT NOT NULL,
    linkedin_url    TEXT NOT NULL,
    phone           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_updated    TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_email UNIQUE (email),
    CONSTRAINT uq_linkedin UNIQUE (linkedin_url)
);


-- ============================================================
-- MEMBER_PROFILE TABLE
-- Structured public/enriched fields from Apollo + signup form.
-- These are the columns we actually have in the CSV.
-- ============================================================
CREATE TABLE member_profile (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id               UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,

    -- Current role (renamed from current_role to avoid reserved word conflict)
    job_title               TEXT,
    current_job_start_date  TEXT,
    seniority_level         TEXT,

    -- Location
    country                 TEXT,
    state_region            TEXT,
    city                    TEXT,

    -- Work email from enrichment
    work_email_enriched     TEXT,

    -- Previous roles (up to 3, matching CSV structure)
    prev_company_1          TEXT,
    prev_role_1             TEXT,
    prev_company_2          TEXT,
    prev_role_2             TEXT,
    prev_company_3          TEXT,
    prev_role_3             TEXT,

    -- ICP status (YES/NO from manual review)
    icp                     TEXT,

    -- Source tag (Website, Luma, Substack, etc.)
    signup_source           TEXT,

    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ============================================================
-- MEMBER_DATA TABLE
-- Flexible JSONB store for qualitative/unpredictable data.
-- Each row is one timestamped entry — never overwrite, only append.
-- Tier: 'user_editable' or 'admin_only'
-- ============================================================
CREATE TABLE member_data (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id   UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    tier        TEXT NOT NULL CHECK (tier IN ('user_editable', 'admin_only')),
    category    TEXT NOT NULL,
    data        JSONB NOT NULL,
    logged_by   TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ============================================================
-- INTERACTIONS TABLE
-- Timeline of every touchpoint: meetings, calls, emails, events
-- ============================================================
CREATE TABLE interactions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id       UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    interaction_type TEXT NOT NULL CHECK (interaction_type IN ('meeting', 'call', 'email', 'event', 'note')),
    summary         TEXT,
    occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    logged_by       TEXT,
    metadata        JSONB
);


-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_members_email        ON members(email);
CREATE INDEX idx_members_linkedin     ON members(linkedin_url);
CREATE INDEX idx_profile_icp          ON member_profile(icp);
CREATE INDEX idx_profile_city         ON member_profile(city);
CREATE INDEX idx_profile_state        ON member_profile(state_region);
CREATE INDEX idx_member_data_member   ON member_data(member_id);
CREATE INDEX idx_member_data_tier     ON member_data(tier);
CREATE INDEX idx_member_data_jsonb    ON member_data USING GIN(data);
CREATE INDEX idx_interactions_member  ON interactions(member_id);


-- ============================================================
-- UPDATED_AT TRIGGER
-- Auto-updates last_updated on members whenever a row changes
-- ============================================================
CREATE OR REPLACE FUNCTION update_last_updated()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_updated = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_members_last_updated
    BEFORE UPDATE ON members
    FOR EACH ROW EXECUTE FUNCTION update_last_updated();
