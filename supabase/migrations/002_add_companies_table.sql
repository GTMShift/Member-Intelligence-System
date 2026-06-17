-- ============================================================
-- GTMShift Member Intelligence Platform
-- Migration 002: Add Companies Table
-- ============================================================
-- Moves company data out of member_profile into its own table.
-- Avoids duplicate company data when multiple members share
-- the same employer (e.g. multiple Salesforce members).
-- Run AFTER 001_initial_schema.sql.
-- ============================================================


-- ============================================================
-- COMPANIES TABLE
-- One row per company. Members reference this via foreign key.
-- ============================================================
CREATE TABLE companies (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    linkedin_url    TEXT,
    domain          TEXT,
    size            TEXT,
    industry        TEXT,
    sub_industry    TEXT,
    overview        TEXT,
    type            TEXT,
    revenue         TEXT,
    tags            TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_company_domain UNIQUE (domain)
);


-- ============================================================
-- UPDATE MEMBER_PROFILE
-- Add company_id foreign key, drop old inline company columns
-- ============================================================
ALTER TABLE member_profile
    ADD COLUMN company_id UUID REFERENCES companies(id) ON DELETE SET NULL;

ALTER TABLE member_profile
    DROP COLUMN company_linkedin_url,
    DROP COLUMN company_domain,
    DROP COLUMN company_size,
    DROP COLUMN company_industry,
    DROP COLUMN company_sub_industry,
    DROP COLUMN company_overview,
    DROP COLUMN company_type,
    DROP COLUMN company_revenue,
    DROP COLUMN company_tags;


-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_companies_name      ON companies(name);
CREATE INDEX idx_companies_domain    ON companies(domain);
CREATE INDEX idx_profile_company_id  ON member_profile(company_id);


-- ============================================================
-- UPDATED_AT TRIGGER FOR COMPANIES
-- ============================================================
CREATE TRIGGER trg_companies_updated_at
    BEFORE UPDATE ON companies
    FOR EACH ROW EXECUTE FUNCTION update_last_updated();
