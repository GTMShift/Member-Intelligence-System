-- ============================================================
-- GTMShift Member Intelligence Platform
-- Migration 004: Profiles Table
-- ============================================================
-- Creates a profiles table linked to Supabase auth.users.
-- Stores role (admin or member) for each authenticated user.
-- This is separate from the members table — profiles are for
-- people who LOG IN to the platform (team + ops staff).
-- Members are the people STORED in the platform (executives).
-- Run AFTER 001, 002, and 003.
-- ============================================================


-- ============================================================
-- PROFILES TABLE
-- One row per authenticated user.
-- Created automatically when a user signs in for the first time
-- via a Supabase trigger (see below).
-- ============================================================
CREATE TABLE profiles (
    id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email       TEXT NOT NULL,
    role        TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
    full_name   TEXT,
    avatar_url  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ============================================================
-- INDEX
-- ============================================================
CREATE INDEX idx_profiles_email ON profiles(email);
CREATE INDEX idx_profiles_role  ON profiles(role);


-- ============================================================
-- TRIGGER FUNCTION
-- Automatically creates a profile row when a new user
-- signs in with Google SSO for the first time.
-- Pulls name and avatar from Google OAuth metadata.
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, avatar_url, role)
    VALUES (
        NEW.id,
        NEW.email,
        NEW.raw_user_meta_data->>'full_name',
        NEW.raw_user_meta_data->>'avatar_url',
        'member'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================
-- TRIGGER
-- Fires after every new user is created in auth.users
-- ============================================================
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();


-- ============================================================
-- UPDATED_AT TRIGGER FOR PROFILES
-- ============================================================
CREATE OR REPLACE FUNCTION update_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION update_profiles_updated_at();
