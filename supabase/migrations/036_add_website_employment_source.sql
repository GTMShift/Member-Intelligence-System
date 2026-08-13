-- 036_add_website_employment_source.sql
--
-- Adds 'Website' as an allowed employment_history.source value, for
-- employment entries created from the Join Us form (via
-- link_join_us_to_member). The existing constraint only allowed Apollo,
-- Manual, and Import — none of which accurately described a form
-- submission from the website.

ALTER TABLE employment_history DROP CONSTRAINT employment_history_source_check;

ALTER TABLE employment_history ADD CONSTRAINT employment_history_source_check
  CHECK (source = ANY (ARRAY['Apollo'::text, 'Manual'::text, 'Import'::text, 'Website'::text]));