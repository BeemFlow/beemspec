-- =============================================================================
-- API role table permissions
-- =============================================================================
--
-- Newer local Supabase Postgres images no longer grant CRUD privileges on
-- tables created by the `postgres` migration role. RLS remains the source of
-- row-level authorization, but PostgREST roles still need the underlying table
-- privileges before policies can be evaluated.

GRANT SELECT, INSERT, UPDATE, DELETE
  ON ALL TABLES IN SCHEMA public
  TO anon, authenticated, service_role;

GRANT USAGE, SELECT, UPDATE
  ON ALL SEQUENCES IN SCHEMA public
  TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES
  TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES
  TO anon, authenticated, service_role;
