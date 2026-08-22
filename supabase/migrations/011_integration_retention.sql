-- =============================================================================
-- Bounded integration queue and webhook retention
-- Depends on: 010_linear_sync_reliability.sql
-- =============================================================================

-- Terminal queue messages are fully represented by integration_sync_state.
-- Delete them instead of retaining a duplicate PGMQ archive indefinitely.
CREATE OR REPLACE FUNCTION delete_linear_sync_job(p_message_id BIGINT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER SET search_path = ''
AS $$
  SELECT pgmq.delete('linear_sync', p_message_id);
$$;

REVOKE ALL ON FUNCTION delete_linear_sync_job(BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION delete_linear_sync_job(BIGINT) TO service_role;

-- Keep the previous RPC safe during a rolling application deployment. It now
-- deletes rather than archives, so old instances also stop growing history.
CREATE OR REPLACE FUNCTION archive_linear_sync_job(p_message_id BIGINT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER SET search_path = ''
AS $$
  SELECT pgmq.delete('linear_sync', p_message_id);
$$;

REVOKE ALL ON FUNCTION archive_linear_sync_job(BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION archive_linear_sync_job(BIGINT) TO service_role;

-- Remove history accumulated before terminal messages switched to deletion.
DO $$
BEGIN
  IF to_regclass('pgmq.a_linear_sync') IS NOT NULL THEN
    EXECUTE 'TRUNCATE TABLE pgmq.a_linear_sync';
  END IF;
END;
$$;

CREATE INDEX idx_integration_webhook_receipts_status_processed_at
  ON integration_webhook_receipts(status, processed_at);

CREATE OR REPLACE FUNCTION prune_integration_history(
  p_processed_receipt_days INTEGER DEFAULT 30,
  p_failed_receipt_days INTEGER DEFAULT 90
)
RETURNS TABLE (
  webhook_receipts_deleted BIGINT,
  orphan_sync_states_deleted BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_webhook_receipts_deleted BIGINT;
  v_orphan_sync_states_deleted BIGINT;
BEGIN
  IF p_processed_receipt_days < 1 OR p_processed_receipt_days > 3650 THEN
    RAISE EXCEPTION 'Processed receipt retention must be between 1 and 3650 days';
  END IF;

  IF p_failed_receipt_days < p_processed_receipt_days OR p_failed_receipt_days > 3650 THEN
    RAISE EXCEPTION 'Failed receipt retention must be between processed retention and 3650 days';
  END IF;

  WITH deleted AS (
    DELETE FROM public.integration_webhook_receipts AS receipt
    WHERE (
      receipt.status IN ('processed', 'ignored')
      AND receipt.processed_at < NOW() - make_interval(days => p_processed_receipt_days)
    ) OR (
      receipt.status = 'failed'
      AND receipt.processed_at < NOW() - make_interval(days => p_failed_receipt_days)
    )
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_webhook_receipts_deleted FROM deleted;

  WITH deleted AS (
    DELETE FROM public.integration_sync_state AS sync_state
    WHERE sync_state.entity_type = 'story'
      AND sync_state.status = 'synced'
      AND NOT EXISTS (
        SELECT 1
        FROM public.stories AS story
        WHERE story.id = sync_state.entity_id
      )
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_orphan_sync_states_deleted FROM deleted;

  RETURN QUERY
  SELECT v_webhook_receipts_deleted, v_orphan_sync_states_deleted;
END;
$$;

REVOKE ALL ON FUNCTION prune_integration_history(INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION prune_integration_history(INTEGER, INTEGER) TO service_role;

-- Clean completed delete tombstones from releases that predate this migration.
DELETE FROM public.integration_sync_state AS sync_state
WHERE sync_state.entity_type = 'story'
  AND sync_state.status = 'synced'
  AND NOT EXISTS (
    SELECT 1
    FROM public.stories AS story
    WHERE story.id = sync_state.entity_id
  );

NOTIFY pgrst, 'reload schema';
