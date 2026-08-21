-- =============================================================================
-- Durable outbound Linear synchronization
-- Depends on: 009_integration_and_ordering_hardening.sql
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgmq;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pgmq.list_queues()
    WHERE queue_name = 'linear_sync'
  ) THEN
    PERFORM pgmq.create('linear_sync');
  END IF;
END;
$$;


-- =============================================================================
-- Provider-neutral, user-visible synchronization state
-- =============================================================================

CREATE TABLE integration_sync_state (
  provider TEXT NOT NULL CHECK (provider IN ('linear')),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('story')),
  entity_id UUID NOT NULL,
  team_id UUID NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('upsert', 'delete')),
  desired_version TIMESTAMPTZ NOT NULL,
  remote_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'synced', 'error')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_error TEXT,
  last_attempted_at TIMESTAMPTZ,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (provider, entity_type, entity_id)
);

CREATE INDEX idx_integration_sync_state_team_status
  ON integration_sync_state(team_id, status, updated_at);

ALTER TABLE integration_sync_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can view integration sync state"
  ON integration_sync_state FOR SELECT
  USING (is_team_member(team_id));

REVOKE ALL ON TABLE integration_sync_state FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE integration_sync_state TO authenticated, service_role;


-- =============================================================================
-- Transactional enqueue for local story creates and content updates
-- =============================================================================

CREATE OR REPLACE FUNCTION enqueue_story_linear_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_team_id UUID;
BEGIN
  -- Service-role writes are integration imports, webhooks, fixtures, or worker
  -- operations. They must not echo back to Linear.
  IF (SELECT auth.role()) = 'service_role'
    OR current_setting('beemspec.linear_sync_origin', true) = 'linear' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
    AND ROW(OLD.title, OLD.status, OLD.content)
      IS NOT DISTINCT FROM ROW(NEW.title, NEW.status, NEW.content) THEN
    RETURN NEW;
  END IF;

  SELECT story_map.team_id
  INTO v_team_id
  FROM public.tasks AS task
  JOIN public.activities AS activity ON activity.id = task.activity_id
  JOIN public.story_maps AS story_map ON story_map.id = activity.story_map_id
  JOIN public.integration_settings AS team_settings
    ON team_settings.team_id = story_map.team_id
    AND NULLIF(BTRIM(team_settings.linear_team_id), '') IS NOT NULL
  JOIN public.story_map_integration_settings AS map_settings
    ON map_settings.story_map_id = story_map.id
    AND NULLIF(BTRIM(map_settings.linear_project_id), '') IS NOT NULL
  JOIN public.linear_oauth_connections AS connection
    ON connection.team_id = story_map.team_id
  WHERE task.id = NEW.task_id;

  IF v_team_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.integration_sync_state (
    provider,
    entity_type,
    entity_id,
    team_id,
    operation,
    desired_version,
    remote_id,
    status,
    attempt_count,
    last_error,
    updated_at
  )
  VALUES (
    'linear',
    'story',
    NEW.id,
    v_team_id,
    'upsert',
    NEW.updated_at,
    NULL,
    'pending',
    0,
    NULL,
    NOW()
  )
  ON CONFLICT (provider, entity_type, entity_id) DO UPDATE
  SET
    team_id = EXCLUDED.team_id,
    operation = EXCLUDED.operation,
    desired_version = EXCLUDED.desired_version,
    remote_id = NULL,
    status = 'pending',
    attempt_count = 0,
    last_error = NULL,
    updated_at = NOW();

  PERFORM pgmq.send(
    'linear_sync',
    jsonb_build_object(
      'provider', 'linear',
      'entity_type', 'story',
      'entity_id', NEW.id,
      'operation', 'upsert',
      'desired_version', NEW.updated_at
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enqueue_story_linear_sync ON stories;
CREATE TRIGGER trg_enqueue_story_linear_sync
  AFTER INSERT OR UPDATE ON stories
  FOR EACH ROW EXECUTE FUNCTION enqueue_story_linear_sync();

REVOKE ALL ON FUNCTION enqueue_story_linear_sync() FROM PUBLIC, anon, authenticated;


-- =============================================================================
-- Atomic local deletion and durable remote-delete intent
-- =============================================================================

CREATE OR REPLACE FUNCTION delete_story_with_linear_sync(p_story_id UUID)
RETURNS SETOF public.stories
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_story public.stories%ROWTYPE;
  v_team_id UUID;
  v_remote_id TEXT;
  v_desired_version TIMESTAMPTZ := clock_timestamp();
BEGIN
  SELECT
    story_map.team_id,
    COALESCE(
      link.linear_issue_id,
      sync_state.remote_id,
      CASE WHEN sync_state.entity_id IS NOT NULL THEN story.id::TEXT END
    )
  INTO v_team_id, v_remote_id
  FROM public.stories AS story
  JOIN public.tasks AS task ON task.id = story.task_id
  JOIN public.activities AS activity ON activity.id = task.activity_id
  JOIN public.story_maps AS story_map ON story_map.id = activity.story_map_id
  LEFT JOIN public.story_linear_links AS link ON link.story_id = story.id
  LEFT JOIN public.integration_sync_state AS sync_state
    ON sync_state.provider = 'linear'
    AND sync_state.entity_type = 'story'
    AND sync_state.entity_id = story.id
  WHERE story.id = p_story_id
  FOR UPDATE OF story;

  IF v_team_id IS NULL THEN
    RETURN;
  END IF;

  SELECT * INTO v_story
  FROM public.stories
  WHERE id = p_story_id;

  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role'
    AND NOT public.is_team_member(v_team_id) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF v_remote_id IS NOT NULL THEN
    INSERT INTO public.integration_sync_state (
      provider,
      entity_type,
      entity_id,
      team_id,
      operation,
      desired_version,
      remote_id,
      status,
      attempt_count,
      last_error,
      updated_at
    )
    VALUES (
      'linear',
      'story',
      p_story_id,
      v_team_id,
      'delete',
      v_desired_version,
      v_remote_id,
      'pending',
      0,
      NULL,
      NOW()
    )
    ON CONFLICT (provider, entity_type, entity_id) DO UPDATE
    SET
      team_id = EXCLUDED.team_id,
      operation = EXCLUDED.operation,
      desired_version = EXCLUDED.desired_version,
      remote_id = EXCLUDED.remote_id,
      status = 'pending',
      attempt_count = 0,
      last_error = NULL,
      updated_at = NOW();

    PERFORM pgmq.send(
      'linear_sync',
      jsonb_build_object(
        'provider', 'linear',
        'entity_type', 'story',
        'entity_id', p_story_id,
        'operation', 'delete',
        'desired_version', v_desired_version,
        'remote_id', v_remote_id,
        'team_id', v_team_id
      )
    );
  END IF;

  DELETE FROM public.stories WHERE id = p_story_id;
  RETURN NEXT v_story;
END;
$$;

REVOKE ALL ON FUNCTION delete_story_with_linear_sync(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION delete_story_with_linear_sync(UUID) TO authenticated, service_role;


-- =============================================================================
-- Restricted worker queue operations
-- =============================================================================

CREATE OR REPLACE FUNCTION claim_linear_sync_jobs(
  p_limit INTEGER DEFAULT 10,
  p_visibility_timeout INTEGER DEFAULT 120
)
RETURNS TABLE (
  message_id BIGINT,
  read_count INTEGER,
  enqueued_at TIMESTAMPTZ,
  payload JSONB
)
LANGUAGE sql
SECURITY DEFINER SET search_path = ''
AS $$
  SELECT
    message.msg_id,
    message.read_ct,
    message.enqueued_at,
    message.message
  FROM pgmq.read(
    'linear_sync',
    GREATEST(1, LEAST(p_visibility_timeout, 900)),
    GREATEST(1, LEAST(p_limit, 100))
  ) AS message;
$$;

CREATE OR REPLACE FUNCTION archive_linear_sync_job(p_message_id BIGINT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER SET search_path = ''
AS $$
  SELECT pgmq.archive('linear_sync', p_message_id);
$$;

CREATE OR REPLACE FUNCTION retry_linear_sync_job(
  p_message_id BIGINT,
  p_delay_seconds INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  PERFORM pgmq.set_vt(
    'linear_sync',
    p_message_id,
    GREATEST(1, LEAST(p_delay_seconds, 86400))
  );
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION claim_linear_sync_jobs(INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION archive_linear_sync_job(BIGINT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION retry_linear_sync_job(BIGINT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION claim_linear_sync_jobs(INTEGER, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION archive_linear_sync_job(BIGINT) TO service_role;
GRANT EXECUTE ON FUNCTION retry_linear_sync_job(BIGINT, INTEGER) TO service_role;


-- =============================================================================
-- Reusable compare-and-swap writeback for manual reconciliation
-- =============================================================================

CREATE OR REPLACE FUNCTION apply_linear_issue_writeback(
  p_story_id UUID,
  p_linear_issue_id TEXT,
  p_linear_issue_identifier TEXT,
  p_expected_story_updated_at TIMESTAMPTZ,
  p_last_linear_updated_at TIMESTAMPTZ,
  p_story_title TEXT,
  p_story_status TEXT,
  p_story_content JSONB
)
RETURNS TABLE (
  applied BOOLEAN,
  conflict BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_team_id UUID;
  v_applied_updated_at TIMESTAMPTZ;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  SELECT story_map.team_id
  INTO v_team_id
  FROM public.stories AS story
  JOIN public.tasks AS task ON task.id = story.task_id
  JOIN public.activities AS activity ON activity.id = task.activity_id
  JOIN public.story_maps AS story_map ON story_map.id = activity.story_map_id
  WHERE story.id = p_story_id;

  IF v_team_id IS NULL THEN
    RAISE EXCEPTION 'Story not found';
  END IF;

  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role'
    AND NOT public.is_team_member(v_team_id) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  PERFORM set_config('beemspec.linear_sync_origin', 'linear', true);

  UPDATE public.stories
  SET
    title = COALESCE(p_story_title, title),
    status = COALESCE(p_story_status, status),
    content = COALESCE(p_story_content, content)
  WHERE id = p_story_id
    AND updated_at = p_expected_story_updated_at
  RETURNING updated_at INTO v_applied_updated_at;

  IF v_applied_updated_at IS NULL THEN
    RETURN QUERY SELECT false, true;
    RETURN;
  END IF;

  INSERT INTO public.story_linear_links (
    story_id,
    linear_issue_id,
    linear_issue_identifier,
    last_local_updated_at,
    last_linear_updated_at,
    sync_state,
    sync_error,
    last_synced_at,
    updated_at
  )
  VALUES (
    p_story_id,
    p_linear_issue_id,
    p_linear_issue_identifier,
    v_applied_updated_at,
    p_last_linear_updated_at,
    'synced',
    NULL,
    v_now,
    v_now
  )
  ON CONFLICT (story_id) DO UPDATE
  SET
    linear_issue_id = EXCLUDED.linear_issue_id,
    linear_issue_identifier = EXCLUDED.linear_issue_identifier,
    last_local_updated_at = EXCLUDED.last_local_updated_at,
    last_linear_updated_at = EXCLUDED.last_linear_updated_at,
    sync_state = 'synced',
    sync_error = NULL,
    last_synced_at = EXCLUDED.last_synced_at,
    updated_at = EXCLUDED.updated_at;

  UPDATE public.integration_sync_state
  SET
    desired_version = v_applied_updated_at,
    operation = 'upsert',
    remote_id = p_linear_issue_id,
    status = 'synced',
    last_error = NULL,
    last_synced_at = v_now,
    updated_at = v_now
  WHERE provider = 'linear'
    AND entity_type = 'story'
    AND entity_id = p_story_id;

  RETURN QUERY SELECT true, false;
END;
$$;

REVOKE ALL ON FUNCTION apply_linear_issue_writeback(
  UUID, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, JSONB
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION apply_linear_issue_writeback(
  UUID, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, JSONB
) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION apply_linear_issue_writeback_with_receipt(
  p_story_id UUID,
  p_linear_issue_id TEXT,
  p_linear_issue_identifier TEXT,
  p_expected_story_updated_at TIMESTAMPTZ,
  p_last_linear_updated_at TIMESTAMPTZ,
  p_story_title TEXT,
  p_story_status TEXT,
  p_story_content JSONB,
  p_idempotency_key TEXT,
  p_event_type TEXT,
  p_event_action TEXT,
  p_payload JSONB
)
RETURNS TABLE (
  duplicate BOOLEAN,
  applied BOOLEAN,
  conflict BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_receipt_id UUID;
  v_applied BOOLEAN;
  v_conflict BOOLEAN;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  INSERT INTO public.integration_webhook_receipts (
    provider,
    idempotency_key,
    event_type,
    event_action,
    status,
    error,
    payload,
    processed_at
  )
  VALUES (
    'linear',
    p_idempotency_key,
    p_event_type,
    p_event_action,
    'processed',
    NULL,
    p_payload,
    v_now
  )
  ON CONFLICT (provider, idempotency_key) DO UPDATE
  SET
    event_type = EXCLUDED.event_type,
    event_action = EXCLUDED.event_action,
    status = 'processed',
    error = NULL,
    payload = EXCLUDED.payload,
    processed_at = EXCLUDED.processed_at
  WHERE public.integration_webhook_receipts.status = 'failed'
  RETURNING id INTO v_receipt_id;

  IF v_receipt_id IS NULL THEN
    RETURN QUERY SELECT true, false, false;
    RETURN;
  END IF;

  SELECT result.applied, result.conflict
  INTO v_applied, v_conflict
  FROM public.apply_linear_issue_writeback(
    p_story_id,
    p_linear_issue_id,
    p_linear_issue_identifier,
    p_expected_story_updated_at,
    p_last_linear_updated_at,
    p_story_title,
    p_story_status,
    p_story_content
  ) AS result;

  IF v_conflict THEN
    UPDATE public.integration_webhook_receipts
    SET
      status = 'ignored',
      error = 'Concurrent local update won conflict resolution',
      processed_at = NOW()
    WHERE id = v_receipt_id;
  END IF;

  RETURN QUERY SELECT false, v_applied, v_conflict;
END;
$$;

NOTIFY pgrst, 'reload schema';
