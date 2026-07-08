-- ============================================================
-- GTMShift Member Intelligence Platform
-- Migration 007: Metro Areas and Zip Code
-- ============================================================
-- Adds support for radius-based metro area classification.
-- Instead of filtering by exact city name (which grows to
-- thousands of unique values), members are grouped into a
-- metro area based on whether their zip code falls within a
-- defined radius of that metro's center point.
--
-- This migration only builds the structure. Actual metro area
-- data (NYC, etc.) and the distance calculation logic are
-- added separately once the radius and city list are confirmed.
-- Run AFTER 001 through 006.
-- ============================================================


-- ============================================================
-- ADD zip_code TO member_profile
-- Nullable for now — will be populated via Apollo enrichment
-- or manual entry once available.
-- ============================================================
ALTER TABLE member_profile
    ADD COLUMN IF NOT EXISTS zip_code TEXT;

CREATE INDEX idx_profile_zip_code ON member_profile(zip_code);


-- ============================================================
-- METRO_AREAS TABLE
-- One row per metro area. Defines a center point and radius.
-- Example: New York City, center lat/lng, radius 75 miles.
-- ============================================================
CREATE TABLE metro_areas (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL UNIQUE,
    center_lat      NUMERIC NOT NULL,
    center_lng      NUMERIC NOT NULL,
    radius_miles    NUMERIC NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_metro_areas_name ON metro_areas(name);


-- ============================================================
-- ADD metro_area_id TO member_profile
-- Calculated field — set once a member's zip_code is checked
-- against all metro_areas. Nullable since not every member
-- will fall within a defined metro radius.
-- ============================================================
ALTER TABLE member_profile
    ADD COLUMN IF NOT EXISTS metro_area_id UUID REFERENCES metro_areas(id) ON DELETE SET NULL;

CREATE INDEX idx_profile_metro_area ON member_profile(metro_area_id);


-- ============================================================
-- UPDATED_AT TRIGGER FOR METRO_AREAS
-- Reuses the existing update_last_updated function from 001
-- ============================================================
CREATE TRIGGER trg_metro_areas_updated_at
    BEFORE UPDATE ON metro_areas
    FOR EACH ROW EXECUTE FUNCTION update_last_updated();
