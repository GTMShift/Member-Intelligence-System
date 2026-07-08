-- ============================================================
-- GTMShift Member Intelligence Platform
-- Migration 005: Schema Cleanup and History Tables
-- ============================================================
-- Changes:
-- 1. Drop job_title from member_profile (employment_history
--    is the single source of truth for all job data)
-- 2. Add is_current to employment_history to flag active job
-- 3. Add history/audit log tables for members, companies,
--    member_profile, and employment_history
-- Run AFTER 001, 002, 003, and 004.
-- ============================================================


-- ============================================================
-- 1. DROP job_title FROM member_profile
-- Current job title is now always pulled from employment_history
-- WHERE is_current = true
-- ============================================================
ALTER TABLE member_profile
    DROP COLUMN IF EXISTS job_title;


-- ============================================================
-- 2. ADD is_current TO employment_history
-- Flags which job is the active/current one.
-- Only one row per member should have is_current = true.
-- When a job changes: set old row to false, insert new row as true.
-- ============================================================
ALTER TABLE employment_history
    ADD COLUMN IF NOT EXISTS is_current BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX idx_employment_is_current ON employment_history(member_id, is_current);


-- ============================================================
-- 3. HISTORY TABLES
-- One history table per core table.
-- Each row is a full snapshot of the record at the time of change.
-- operation: INSERT, UPDATE, or DELETE
-- changed_at: when the change happened
-- changed_by: auth user id who made the change (nullable for system)
-- ============================================================

-- Members history
CREATE TABLE members_history (
    history_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    operation       TEXT NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
    changed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    changed_by      UUID,

    -- Snapshot of members row at time of change
    id              UUID,
    first_name      TEXT,
    last_name       TEXT,
    email           TEXT,
    linkedin_url    TEXT,
    phone           TEXT,
    enriched_at     TIMESTAMPTZ,
    record_source   TEXT,
    subscription_status TEXT,
    signup_date     TIMESTAMPTZ,
    last_engagement_date TIMESTAMPTZ,
    engagement_score NUMERIC,
    created_at      TIMESTAMPTZ,
    last_updated    TIMESTAMPTZ
);

-- Companies history
CREATE TABLE companies_history (
    history_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    operation       TEXT NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
    changed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    changed_by      UUID,

    -- Snapshot of companies row at time of change
    id              UUID,
    name            TEXT,
    linkedin_url    TEXT,
    domain          TEXT,
    size            TEXT,
    industry        TEXT,
    sub_industry    TEXT,
    overview        TEXT,
    company_type    TEXT,
    revenue         TEXT,
    tags            TEXT,
    created_at      TIMESTAMPTZ,
    updated_at      TIMESTAMPTZ
);

-- Member profile history
CREATE TABLE member_profile_history (
    history_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    operation       TEXT NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
    changed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    changed_by      UUID,

    -- Snapshot of member_profile row at time of change
    id              UUID,
    member_id       UUID,
    company_id      UUID,
    current_job_start_date TEXT,
    seniority_level TEXT,
    country         TEXT,
    state_region    TEXT,
    city            TEXT,
    work_email_enriched TEXT,
    icp             TEXT,
    signup_source   TEXT,
    updated_at      TIMESTAMPTZ
);

-- Employment history log
CREATE TABLE employment_history_log (
    history_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    operation       TEXT NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
    changed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    changed_by      UUID,

    -- Snapshot of employment_history row at time of change
    id              UUID,
    member_id       UUID,
    company         TEXT,
    role            TEXT,
    start_date      DATE,
    end_date        DATE,
    is_current      BOOLEAN,
    source          TEXT,
    created_at      TIMESTAMPTZ
);


-- ============================================================
-- INDEXES ON HISTORY TABLES
-- Fast lookup by member_id and changed_at
-- ============================================================
CREATE INDEX idx_members_history_id         ON members_history(id);
CREATE INDEX idx_members_history_changed    ON members_history(changed_at);
CREATE INDEX idx_companies_history_id       ON companies_history(id);
CREATE INDEX idx_companies_history_changed  ON companies_history(changed_at);
CREATE INDEX idx_profile_history_member     ON member_profile_history(member_id);
CREATE INDEX idx_profile_history_changed    ON member_profile_history(changed_at);
CREATE INDEX idx_emp_history_log_member     ON employment_history_log(member_id);
CREATE INDEX idx_emp_history_log_changed    ON employment_history_log(changed_at);


-- ============================================================
-- TRIGGER FUNCTIONS FOR HISTORY TABLES
-- Automatically logs every INSERT, UPDATE, DELETE
-- ============================================================

-- Members trigger function
CREATE OR REPLACE FUNCTION log_members_history()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        INSERT INTO members_history (operation, id, first_name, last_name, email,
            linkedin_url, phone, enriched_at, record_source, subscription_status,
            signup_date, last_engagement_date, engagement_score, created_at, last_updated)
        VALUES ('DELETE', OLD.id, OLD.first_name, OLD.last_name, OLD.email,
            OLD.linkedin_url, OLD.phone, OLD.enriched_at, OLD.record_source,
            OLD.subscription_status, OLD.signup_date, OLD.last_engagement_date,
            OLD.engagement_score, OLD.created_at, OLD.last_updated);
        RETURN OLD;
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO members_history (operation, id, first_name, last_name, email,
            linkedin_url, phone, enriched_at, record_source, subscription_status,
            signup_date, last_engagement_date, engagement_score, created_at, last_updated)
        VALUES ('UPDATE', NEW.id, NEW.first_name, NEW.last_name, NEW.email,
            NEW.linkedin_url, NEW.phone, NEW.enriched_at, NEW.record_source,
            NEW.subscription_status, NEW.signup_date, NEW.last_engagement_date,
            NEW.engagement_score, NEW.created_at, NEW.last_updated);
        RETURN NEW;
    ELSIF TG_OP = 'INSERT' THEN
        INSERT INTO members_history (operation, id, first_name, last_name, email,
            linkedin_url, phone, enriched_at, record_source, subscription_status,
            signup_date, last_engagement_date, engagement_score, created_at, last_updated)
        VALUES ('INSERT', NEW.id, NEW.first_name, NEW.last_name, NEW.email,
            NEW.linkedin_url, NEW.phone, NEW.enriched_at, NEW.record_source,
            NEW.subscription_status, NEW.signup_date, NEW.last_engagement_date,
            NEW.engagement_score, NEW.created_at, NEW.last_updated);
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Companies trigger function
CREATE OR REPLACE FUNCTION log_companies_history()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        INSERT INTO companies_history (operation, id, name, linkedin_url, domain,
            size, industry, sub_industry, overview, company_type, revenue, tags,
            created_at, updated_at)
        VALUES ('DELETE', OLD.id, OLD.name, OLD.linkedin_url, OLD.domain,
            OLD.size, OLD.industry, OLD.sub_industry, OLD.overview, OLD.company_type,
            OLD.revenue, OLD.tags, OLD.created_at, OLD.updated_at);
        RETURN OLD;
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO companies_history (operation, id, name, linkedin_url, domain,
            size, industry, sub_industry, overview, company_type, revenue, tags,
            created_at, updated_at)
        VALUES ('UPDATE', NEW.id, NEW.name, NEW.linkedin_url, NEW.domain,
            NEW.size, NEW.industry, NEW.sub_industry, NEW.overview, NEW.company_type,
            NEW.revenue, NEW.tags, NEW.created_at, NEW.updated_at);
        RETURN NEW;
    ELSIF TG_OP = 'INSERT' THEN
        INSERT INTO companies_history (operation, id, name, linkedin_url, domain,
            size, industry, sub_industry, overview, company_type, revenue, tags,
            created_at, updated_at)
        VALUES ('INSERT', NEW.id, NEW.name, NEW.linkedin_url, NEW.domain,
            NEW.size, NEW.industry, NEW.sub_industry, NEW.overview, NEW.company_type,
            NEW.revenue, NEW.tags, NEW.created_at, NEW.updated_at);
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Member profile trigger function
CREATE OR REPLACE FUNCTION log_member_profile_history()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        INSERT INTO member_profile_history (operation, id, member_id, company_id,
            current_job_start_date, seniority_level, country, state_region, city,
            work_email_enriched, icp, signup_source, updated_at)
        VALUES ('DELETE', OLD.id, OLD.member_id, OLD.company_id,
            OLD.current_job_start_date, OLD.seniority_level, OLD.country,
            OLD.state_region, OLD.city, OLD.work_email_enriched, OLD.icp,
            OLD.signup_source, OLD.updated_at);
        RETURN OLD;
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO member_profile_history (operation, id, member_id, company_id,
            current_job_start_date, seniority_level, country, state_region, city,
            work_email_enriched, icp, signup_source, updated_at)
        VALUES ('UPDATE', NEW.id, NEW.member_id, NEW.company_id,
            NEW.current_job_start_date, NEW.seniority_level, NEW.country,
            NEW.state_region, NEW.city, NEW.work_email_enriched, NEW.icp,
            NEW.signup_source, NEW.updated_at);
        RETURN NEW;
    ELSIF TG_OP = 'INSERT' THEN
        INSERT INTO member_profile_history (operation, id, member_id, company_id,
            current_job_start_date, seniority_level, country, state_region, city,
            work_email_enriched, icp, signup_source, updated_at)
        VALUES ('INSERT', NEW.id, NEW.member_id, NEW.company_id,
            NEW.current_job_start_date, NEW.seniority_level, NEW.country,
            NEW.state_region, NEW.city, NEW.work_email_enriched, NEW.icp,
            NEW.signup_source, NEW.updated_at);
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Employment history trigger function
CREATE OR REPLACE FUNCTION log_employment_history()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        INSERT INTO employment_history_log (operation, id, member_id, company,
            role, start_date, end_date, is_current, source, created_at)
        VALUES ('DELETE', OLD.id, OLD.member_id, OLD.company, OLD.role,
            OLD.start_date, OLD.end_date, OLD.is_current, OLD.source, OLD.created_at);
        RETURN OLD;
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO employment_history_log (operation, id, member_id, company,
            role, start_date, end_date, is_current, source, created_at)
        VALUES ('UPDATE', NEW.id, NEW.member_id, NEW.company, NEW.role,
            NEW.start_date, NEW.end_date, NEW.is_current, NEW.source, NEW.created_at);
        RETURN NEW;
    ELSIF TG_OP = 'INSERT' THEN
        INSERT INTO employment_history_log (operation, id, member_id, company,
            role, start_date, end_date, is_current, source, created_at)
        VALUES ('INSERT', NEW.id, NEW.member_id, NEW.company, NEW.role,
            NEW.start_date, NEW.end_date, NEW.is_current, NEW.source, NEW.created_at);
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;


-- ============================================================
-- ATTACH TRIGGERS TO TABLES
-- ============================================================
CREATE TRIGGER trg_members_history
    AFTER INSERT OR UPDATE OR DELETE ON members
    FOR EACH ROW EXECUTE FUNCTION log_members_history();

CREATE TRIGGER trg_companies_history
    AFTER INSERT OR UPDATE OR DELETE ON companies
    FOR EACH ROW EXECUTE FUNCTION log_companies_history();

CREATE TRIGGER trg_member_profile_history
    AFTER INSERT OR UPDATE OR DELETE ON member_profile
    FOR EACH ROW EXECUTE FUNCTION log_member_profile_history();

CREATE TRIGGER trg_employment_history_log
    AFTER INSERT OR UPDATE OR DELETE ON employment_history
    FOR EACH ROW EXECUTE FUNCTION log_employment_history();
