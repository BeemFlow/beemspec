-- =============================================================================
-- Harden API role table permissions
-- =============================================================================
--
-- Migration 007 restored the broad API grants expected by older Supabase
-- images. The application requires authentication for all public tables, so
-- remove anonymous access and make future API grants explicit.

REVOKE SELECT, INSERT, UPDATE, DELETE
  ON ALL TABLES IN SCHEMA public
  FROM anon;

REVOKE USAGE, SELECT, UPDATE
  ON ALL SEQUENCES IN SCHEMA public
  FROM anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES
  FROM anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE USAGE, SELECT, UPDATE ON SEQUENCES
  FROM anon, authenticated, service_role;
