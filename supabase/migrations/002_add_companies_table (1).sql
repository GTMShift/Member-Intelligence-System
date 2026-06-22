-- ============================================================
-- GTMShift Member Intelligence Platform
-- Migration 002: Add Companies Table
-- ============================================================
-- Run AFTER 001_initial_schema.sql.
-- Company columns were never added to member_profile in 001
-- so this migration only creates the companies table and
-- adds the foreign key to member_profile.
-- ============================================================


-- ============================================================
-- COMPANIES TABLE
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
    company_type    TEXT,
    revenue         TEXT,
    tags            TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_company_domain UNIQUE (domain)
);


-- ============================================================
-- ADD FOREIGN KEY TO MEMBER_PROFILE
-- ============================================================
ALTER TABLE member_profile
    ADD COLUMN company_id UUID REFERENCES companies(id) ON DELETE SET NULL;


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
