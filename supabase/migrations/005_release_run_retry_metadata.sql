-- =============================================================================
-- Release Run Retry Metadata
-- =============================================================================

ALTER TABLE release_run_items
  ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN last_retry_at TIMESTAMPTZ;

ALTER TABLE release_run_items
  ADD CONSTRAINT release_run_items_retry_count_non_negative CHECK (retry_count >= 0);
