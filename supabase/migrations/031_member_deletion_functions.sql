-- 031_member_deletion_functions.sql
--
-- Reusable, safe functions for previewing and performing a full member
-- deletion, instead of manually working through this table-by-table each
-- time. Covers every table currently referencing members.id.
--
-- profiles (a real auth login account) is UNLINKED, not deleted.
--
-- Both member_profile and members have their own history-logging triggers
-- (trg_member_profile_history, trg_members_history) that fire on DELETE and
-- would otherwise immediately re-create the exact row we just cleared —
-- both are temporarily disabled around their respective deletes.

CREATE OR REPLACE FUNCTION delete_member_safely(p_member_id uuid)
RETURNS void AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM members WHERE id = p_member_id) THEN
    RAISE EXCEPTION 'No member found with id %', p_member_id;
  END IF;

  -- Unlink (don't delete) any auth profile pointing at this member
  UPDATE profiles SET member_id = NULL WHERE member_id = p_member_id;

  -- Delete every other dependent row
  DELETE FROM substack_subscribers WHERE member_id = p_member_id;
  DELETE FROM substack_engagement_snapshots WHERE member_id = p_member_id;

  -- employment_history has its own logging trigger too (trg_employment_history_log),
  -- same pattern as member_profile/members below — disable it around the delete,
  -- otherwise deleting employment_history immediately re-creates a fresh
  -- employment_history_log row logging that very deletion.
  EXECUTE 'ALTER TABLE employment_history DISABLE TRIGGER trg_employment_history_log';
  DELETE FROM employment_history_log WHERE member_id = p_member_id;
  DELETE FROM employment_history WHERE member_id = p_member_id;
  EXECUTE 'ALTER TABLE employment_history ENABLE TRIGGER trg_employment_history_log';

  DELETE FROM interactions WHERE member_id = p_member_id;
  DELETE FROM event_signups WHERE member_id = p_member_id;
  DELETE FROM newsletter_engagement WHERE member_id = p_member_id;
  DELETE FROM enrichment_runs WHERE member_id = p_member_id;
  DELETE FROM member_data WHERE member_id = p_member_id;
  DELETE FROM member_socials WHERE member_id = p_member_id;
  DELETE FROM duplicate_flags WHERE existing_member_id = p_member_id;
  DELETE FROM notifications WHERE member_id = p_member_id;
  DELETE FROM otr_applications WHERE member_id = p_member_id;
  DELETE FROM speaker_applications WHERE member_id = p_member_id;

  -- member_profile_history + member_profile (disable logging trigger first,
  -- since deleting member_profile would otherwise immediately re-create a
  -- fresh member_profile_history row logging that very deletion)
  EXECUTE 'ALTER TABLE member_profile DISABLE TRIGGER trg_member_profile_history';
  DELETE FROM member_profile_history WHERE member_id = p_member_id;
  DELETE FROM member_profile WHERE member_id = p_member_id;
  EXECUTE 'ALTER TABLE member_profile ENABLE TRIGGER trg_member_profile_history';

  -- members_history + the member row itself (same pattern)
  EXECUTE 'ALTER TABLE members DISABLE TRIGGER trg_members_history';
  DELETE FROM members_history WHERE id = p_member_id;
  DELETE FROM members WHERE id = p_member_id;
  EXECUTE 'ALTER TABLE members ENABLE TRIGGER trg_members_history';
END;
$$ LANGUAGE plpgsql;

-- Returns the actual row data (as JSON, since every table has a different
-- set of columns) rather than just a count — tables with nothing for this
-- member simply don't appear in the result at all.
DROP FUNCTION IF EXISTS preview_member_deletion(uuid);

CREATE FUNCTION preview_member_deletion(p_member_id uuid)
RETURNS TABLE (table_name text, row_data jsonb) AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM members WHERE id = p_member_id) THEN
    RAISE EXCEPTION 'No member found with id %', p_member_id;
  END IF;

  RETURN QUERY
  SELECT 'members (the member itself)'::text, to_jsonb(t) FROM members t WHERE t.id = p_member_id
  UNION ALL
  SELECT 'profiles (will be unlinked, not deleted)', to_jsonb(t) FROM profiles t WHERE t.member_id = p_member_id
  UNION ALL
  SELECT 'member_profile', to_jsonb(t) FROM member_profile t WHERE t.member_id = p_member_id
  UNION ALL
  SELECT 'member_profile_history', to_jsonb(t) FROM member_profile_history t WHERE t.member_id = p_member_id
  UNION ALL
  SELECT 'substack_subscribers', to_jsonb(t) FROM substack_subscribers t WHERE t.member_id = p_member_id
  UNION ALL
  SELECT 'substack_engagement_snapshots', to_jsonb(t) FROM substack_engagement_snapshots t WHERE t.member_id = p_member_id
  UNION ALL
  SELECT 'employment_history', to_jsonb(t) FROM employment_history t WHERE t.member_id = p_member_id
  UNION ALL
  SELECT 'employment_history_log', to_jsonb(t) FROM employment_history_log t WHERE t.member_id = p_member_id
  UNION ALL
  SELECT 'interactions', to_jsonb(t) FROM interactions t WHERE t.member_id = p_member_id
  UNION ALL
  SELECT 'event_signups', to_jsonb(t) FROM event_signups t WHERE t.member_id = p_member_id
  UNION ALL
  SELECT 'newsletter_engagement', to_jsonb(t) FROM newsletter_engagement t WHERE t.member_id = p_member_id
  UNION ALL
  SELECT 'enrichment_runs', to_jsonb(t) FROM enrichment_runs t WHERE t.member_id = p_member_id
  UNION ALL
  SELECT 'member_data', to_jsonb(t) FROM member_data t WHERE t.member_id = p_member_id
  UNION ALL
  SELECT 'member_socials', to_jsonb(t) FROM member_socials t WHERE t.member_id = p_member_id
  UNION ALL
  SELECT 'duplicate_flags', to_jsonb(t) FROM duplicate_flags t WHERE t.existing_member_id = p_member_id
  UNION ALL
  SELECT 'notifications', to_jsonb(t) FROM notifications t WHERE t.member_id = p_member_id
  UNION ALL
  SELECT 'otr_applications', to_jsonb(t) FROM otr_applications t WHERE t.member_id = p_member_id
  UNION ALL
  SELECT 'speaker_applications', to_jsonb(t) FROM speaker_applications t WHERE t.member_id = p_member_id
  UNION ALL
  SELECT 'members_history', to_jsonb(t) FROM members_history t WHERE t.id = p_member_id;
END;
$$ LANGUAGE plpgsql STABLE;