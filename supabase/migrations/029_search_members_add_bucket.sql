-- 029_search_members_add_bucket.sql
--
-- Adds bucket to what search_members returns. Needed for the new
-- IcpBucketBadge in MemberSearchPanel, which reads member.bucket for each
-- search result — without this, that badge would silently show
-- "Unclassified" for every single member, regardless of their real
-- classification, since the data was never being returned in the first place.

DROP FUNCTION IF EXISTS search_members(
  text, text, text, text, text, text, text, text, text, text, int, int
);

CREATE FUNCTION search_members(
  p_q text DEFAULT NULL,
  p_icp text DEFAULT NULL,
  p_metro_area_name text DEFAULT NULL,
  p_state text DEFAULT NULL,
  p_industry text DEFAULT NULL,
  p_seniority text DEFAULT NULL,
  p_source text DEFAULT NULL,
  p_team_size text DEFAULT NULL,
  p_tag text DEFAULT NULL,
  p_sort text DEFAULT 'last_name_asc',
  p_page int DEFAULT 1,
  p_limit int DEFAULT 50
)
RETURNS TABLE (
  total bigint,
  id uuid,
  first_name text,
  last_name text,
  email text,
  company_id uuid,
  company_name text,
  current_role_title text,
  metro_area_name text,
  state_region text,
  icp text,
  bucket text,
  last_updated timestamptz
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_offset int := (greatest(p_page, 1) - 1) * greatest(p_limit, 1);
  v_team_min int;
  v_team_max int;
BEGIN
  CASE p_team_size
    WHEN '1-10' THEN v_team_min := 1; v_team_max := 10;
    WHEN '11-50' THEN v_team_min := 11; v_team_max := 50;
    WHEN '51-200' THEN v_team_min := 51; v_team_max := 200;
    WHEN '201-500' THEN v_team_min := 201; v_team_max := 500;
    WHEN '501-1000' THEN v_team_min := 501; v_team_max := 1000;
    WHEN '1000+' THEN v_team_min := 1001; v_team_max := 2147483647;
    ELSE v_team_min := NULL; v_team_max := NULL;
  END CASE;

  RETURN QUERY
  WITH base AS (
    SELECT
      m.id,
      m.first_name,
      m.last_name,
      m.email,
      m.created_at,
      m.last_updated,
      mp.company_id,
      c.name AS company_name,
      c.industry,
      ma.name AS metro_area_name,
      mp.state_region,
      mp.icp,
      mp.bucket,
      mp.seniority_level,
      mp.signup_source,
      mp.team_size,
      mp.tags,
      eh.role AS current_role_title
    FROM members m
    LEFT JOIN member_profile mp ON mp.member_id = m.id
    LEFT JOIN companies c ON c.id = mp.company_id
    LEFT JOIN metro_areas ma ON ma.id = mp.metro_area_id
    LEFT JOIN employment_history eh ON eh.member_id = m.id AND eh.is_current = true
  ),
  filtered AS (
    SELECT * FROM base b
    WHERE
      (p_q IS NULL OR p_q = '' OR (
        b.first_name ILIKE '%' || p_q || '%'
        OR b.last_name ILIKE '%' || p_q || '%'
        OR (b.first_name || ' ' || b.last_name) ILIKE '%' || p_q || '%'
        OR b.email ILIKE '%' || p_q || '%'
        OR b.company_name ILIKE '%' || p_q || '%'
        OR b.current_role_title ILIKE '%' || p_q || '%'
      ))
      AND (
        p_icp IS NULL
        OR (p_icp = 'NONE' AND b.icp IS NULL)
        OR (p_icp != 'NONE' AND b.icp = p_icp)
      )
      AND (p_metro_area_name IS NULL OR b.metro_area_name = p_metro_area_name)
      AND (p_state IS NULL OR b.state_region = p_state)
      AND (p_industry IS NULL OR b.industry = p_industry)
      AND (p_seniority IS NULL OR b.seniority_level = p_seniority)
      AND (p_source IS NULL OR b.signup_source = p_source)
      AND (
        v_team_min IS NULL
        OR (b.team_size IS NOT NULL AND b.team_size >= v_team_min AND b.team_size <= v_team_max)
      )
      AND (p_tag IS NULL OR b.tags @> ARRAY[p_tag])
  ),
  counted AS (
    SELECT count(*) OVER () AS total_count, f.*
    FROM filtered f
  )
  SELECT
    coalesce((SELECT total_count FROM counted LIMIT 1), 0) AS total,
    c.id, c.first_name, c.last_name, c.email, c.company_id, c.company_name,
    c.current_role_title, c.metro_area_name, c.state_region, c.icp, c.bucket, c.last_updated
  FROM counted c
  ORDER BY
    CASE WHEN p_sort = 'last_name_asc' OR p_sort IS NULL THEN c.last_name END ASC,
    CASE WHEN p_sort = 'last_name_asc' OR p_sort IS NULL THEN c.first_name END ASC,
    CASE WHEN p_sort = 'last_name_desc' THEN c.last_name END DESC,
    CASE WHEN p_sort = 'last_name_desc' THEN c.first_name END DESC,
    CASE WHEN p_sort = 'first_name_asc' THEN c.first_name END ASC,
    CASE WHEN p_sort = 'first_name_asc' THEN c.last_name END ASC,
    CASE WHEN p_sort = 'first_name_desc' THEN c.first_name END DESC,
    CASE WHEN p_sort = 'first_name_desc' THEN c.last_name END DESC,
    CASE WHEN p_sort = 'signup_newest' THEN c.created_at END DESC,
    CASE WHEN p_sort = 'signup_oldest' THEN c.created_at END ASC,
    CASE WHEN p_sort = 'updated_newest' THEN c.last_updated END DESC,
    CASE WHEN p_sort = 'updated_oldest' THEN c.last_updated END ASC
  LIMIT p_limit OFFSET v_offset;
END;
$$;