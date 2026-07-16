-- ============================================================
-- GTMShift Member Intelligence Platform
-- Migration 006: Notifications Table
-- ============================================================
-- Stores all platform notifications for admin review.
-- Covers: duplicate detection, job changes, new signups,
-- enrichment results, and profile updates.
-- Run AFTER 001, 002, 003, 004, and 005.
-- ============================================================


-- ============================================================
-- NOTIFICATIONS TABLE
-- ============================================================
CREATE TABLE notifications (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type        TEXT NOT NULL CHECK (type IN (
                    'duplicate_detected',
                    'job_change',
                    'new_signup',
                    'enrichment_complete',
                    'enrichment_failed',
                    'profile_updated'
                )),
    title       TEXT NOT NULL,
    body        TEXT NOT NULL,
    member_id   UUID REFERENCES members(id) ON DELETE SET NULL,
    is_read     BOOLEAN NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_notifications_type      ON notifications(type);
CREATE INDEX idx_notifications_is_read   ON notifications(is_read);
CREATE INDEX idx_notifications_member    ON notifications(member_id);
CREATE INDEX idx_notifications_created   ON notifications(created_at DESC);
