-- =============================================================================
-- Release Run OpenCode Session Linkage
-- =============================================================================

ALTER TABLE release_run_items
  ADD COLUMN opencode_session_id TEXT,
  ADD COLUMN opencode_session_url TEXT;

CREATE INDEX idx_release_run_items_opencode_session_id
  ON release_run_items(opencode_session_id)
  WHERE opencode_session_id IS NOT NULL;
