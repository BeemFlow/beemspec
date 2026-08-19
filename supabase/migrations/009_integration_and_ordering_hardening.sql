-- =============================================================================
-- Integration idempotency, conflict safety, and ordered-list hardening
-- Depends on: 008_harden_api_table_permissions.sql
-- =============================================================================


-- =============================================================================
-- Concurrency-safe automatic sort positions
-- =============================================================================

CREATE OR REPLACE FUNCTION auto_sort_order_releases()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.sort_order IS NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('releases:' || NEW.story_map_id::text, 0));
    SELECT COALESCE(MAX(sort_order), -1) + 1 INTO NEW.sort_order
    FROM releases WHERE story_map_id = NEW.story_map_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION auto_sort_order_activities()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.sort_order IS NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('activities:' || NEW.story_map_id::text, 0));
    SELECT COALESCE(MAX(sort_order), -1) + 1 INTO NEW.sort_order
    FROM activities WHERE story_map_id = NEW.story_map_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION auto_sort_order_tasks()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.sort_order IS NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('tasks:' || NEW.activity_id::text, 0));
    SELECT COALESCE(MAX(sort_order), -1) + 1 INTO NEW.sort_order
    FROM tasks WHERE activity_id = NEW.activity_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION auto_sort_order_stories()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.sort_order IS NULL THEN
    PERFORM pg_advisory_xact_lock(
      hashtextextended(
        'stories:' || NEW.task_id::text || ':' || COALESCE(NEW.release_id::text, 'backlog'),
        0
      )
    );
    SELECT COALESCE(MAX(sort_order), -1) + 1 INTO NEW.sort_order
    FROM stories
    WHERE task_id = NEW.task_id
      AND release_id IS NOT DISTINCT FROM NEW.release_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- =============================================================================
-- Normalize both sides of cross-parent moves
-- =============================================================================

CREATE OR REPLACE FUNCTION move_task_and_reorder(
  p_task_id UUID,
  p_target_activity_id UUID,
  p_target_order UUID[]
)
RETURNS void AS $$
DECLARE
  v_source_activity_id UUID;
  v_current_story_map_id UUID;
  v_target_story_map_id UUID;
BEGIN
  IF NOT (p_task_id = ANY(p_target_order)) THEN
    RAISE EXCEPTION 'Target order must include moved task id';
  END IF;

  SELECT t.activity_id, a.story_map_id
  INTO v_source_activity_id, v_current_story_map_id
  FROM tasks t
  JOIN activities a ON a.id = t.activity_id
  WHERE t.id = p_task_id
  FOR UPDATE OF t;

  IF v_current_story_map_id IS NULL THEN
    RAISE EXCEPTION 'Task not found';
  END IF;

  SELECT story_map_id
  INTO v_target_story_map_id
  FROM activities
  WHERE id = p_target_activity_id;

  IF v_target_story_map_id IS NULL THEN
    RAISE EXCEPTION 'Target activity not found';
  END IF;

  IF v_current_story_map_id <> v_target_story_map_id THEN
    RAISE EXCEPTION 'Task target activity must belong to the same story map';
  END IF;

  UPDATE tasks
  SET activity_id = p_target_activity_id, sort_order = NULL
  WHERE id = p_task_id;

  PERFORM reorder_tasks(p_target_activity_id, p_target_order);

  IF v_source_activity_id <> p_target_activity_id THEN
    WITH ordered AS (
      SELECT id, ROW_NUMBER() OVER (ORDER BY sort_order, id)::INTEGER AS position
      FROM tasks
      WHERE activity_id = v_source_activity_id
    )
    UPDATE tasks
    SET sort_order = -ordered.position
    FROM ordered
    WHERE tasks.id = ordered.id;

    UPDATE tasks
    SET sort_order = ABS(sort_order) - 1
    WHERE activity_id = v_source_activity_id;
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION move_story_and_reorder(
  p_story_id UUID,
  p_target_task_id UUID,
  p_target_release_id UUID,
  p_target_order UUID[]
)
RETURNS void AS $$
DECLARE
  v_source_task_id UUID;
  v_source_release_id UUID;
  v_current_story_map_id UUID;
  v_target_story_map_id UUID;
BEGIN
  IF NOT (p_story_id = ANY(p_target_order)) THEN
    RAISE EXCEPTION 'Target order must include moved story id';
  END IF;

  SELECT s.task_id, s.release_id, a.story_map_id
  INTO v_source_task_id, v_source_release_id, v_current_story_map_id
  FROM stories s
  JOIN tasks t ON t.id = s.task_id
  JOIN activities a ON a.id = t.activity_id
  WHERE s.id = p_story_id
  FOR UPDATE OF s;

  IF v_current_story_map_id IS NULL THEN
    RAISE EXCEPTION 'Story not found';
  END IF;

  SELECT a.story_map_id
  INTO v_target_story_map_id
  FROM tasks t
  JOIN activities a ON a.id = t.activity_id
  WHERE t.id = p_target_task_id;

  IF v_target_story_map_id IS NULL THEN
    RAISE EXCEPTION 'Target task not found';
  END IF;

  IF v_current_story_map_id <> v_target_story_map_id THEN
    RAISE EXCEPTION 'Story target task must belong to the same story map';
  END IF;

  UPDATE stories
  SET task_id = p_target_task_id, release_id = p_target_release_id, sort_order = NULL
  WHERE id = p_story_id;

  PERFORM reorder_stories(p_target_task_id, p_target_release_id, p_target_order);

  IF v_source_task_id <> p_target_task_id
    OR v_source_release_id IS DISTINCT FROM p_target_release_id THEN
    WITH ordered AS (
      SELECT id, ROW_NUMBER() OVER (ORDER BY sort_order, id)::INTEGER AS position
      FROM stories
      WHERE task_id = v_source_task_id
        AND release_id IS NOT DISTINCT FROM v_source_release_id
    )
    UPDATE stories
    SET sort_order = -ordered.position
    FROM ordered
    WHERE stories.id = ordered.id;

    UPDATE stories
    SET sort_order = ABS(sort_order) - 1
    WHERE task_id = v_source_task_id
      AND release_id IS NOT DISTINCT FROM v_source_release_id;
  END IF;
END;
$$ LANGUAGE plpgsql;


-- =============================================================================
-- Atomic Linear issue import
-- =============================================================================

CREATE OR REPLACE FUNCTION import_linear_issue_into_story_map(
  p_story_map_id UUID,
  p_linear_issue_id TEXT,
  p_linear_issue_identifier TEXT,
  p_story_title TEXT,
  p_story_status TEXT,
  p_story_content JSONB,
  p_story_updated_at TIMESTAMPTZ,
  p_idempotency_key TEXT,
  p_event_type TEXT,
  p_event_action TEXT,
  p_payload JSONB
)
RETURNS TABLE (
  duplicate BOOLEAN,
  story_id UUID
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_receipt_id UUID;
  v_existing_story_id UUID;
  v_activity_id UUID;
  v_activity_order UUID[];
  v_task_id UUID;
  v_story_id UUID;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    INSERT INTO integration_webhook_receipts (
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
      NOW()
    )
    ON CONFLICT (provider, idempotency_key) DO UPDATE
    SET
      event_type = EXCLUDED.event_type,
      event_action = EXCLUDED.event_action,
      status = 'processed',
      error = NULL,
      payload = EXCLUDED.payload,
      processed_at = NOW()
    WHERE integration_webhook_receipts.status = 'failed'
    RETURNING id INTO v_receipt_id;

    IF v_receipt_id IS NULL THEN
      SELECT links.story_id INTO v_existing_story_id
      FROM story_linear_links AS links
      WHERE links.linear_issue_id = p_linear_issue_id;

      RETURN QUERY SELECT true, v_existing_story_id;
      RETURN;
    END IF;
  END IF;

  PERFORM 1
  FROM story_maps
  WHERE id = p_story_map_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Story map not found';
  END IF;

  SELECT links.story_id INTO v_existing_story_id
  FROM story_linear_links AS links
  WHERE links.linear_issue_id = p_linear_issue_id;

  IF v_existing_story_id IS NOT NULL THEN
    RETURN QUERY SELECT true, v_existing_story_id;
    RETURN;
  END IF;

  SELECT id INTO v_activity_id
  FROM activities
  WHERE story_map_id = p_story_map_id
    AND lower(name) = 'untriaged'
  ORDER BY sort_order, id
  LIMIT 1;

  IF v_activity_id IS NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('activities:' || p_story_map_id::text, 0));

    INSERT INTO activities (story_map_id, name, description)
    VALUES (p_story_map_id, 'Untriaged', 'Imported from Linear for triage')
    RETURNING id INTO v_activity_id;

    SELECT array_agg(id ORDER BY CASE WHEN id = v_activity_id THEN 0 ELSE 1 END, sort_order, id)
    INTO v_activity_order
    FROM activities
    WHERE story_map_id = p_story_map_id;

    PERFORM reorder_activities(p_story_map_id, v_activity_order);
  END IF;

  SELECT id INTO v_task_id
  FROM tasks
  WHERE activity_id = v_activity_id
    AND lower(name) = 'untriaged'
  ORDER BY sort_order, id
  LIMIT 1;

  IF v_task_id IS NULL THEN
    INSERT INTO tasks (activity_id, name, description)
    VALUES (v_activity_id, 'Untriaged', 'Imported Linear issues')
    RETURNING id INTO v_task_id;
  END IF;

  INSERT INTO stories (
    task_id,
    release_id,
    title,
    status,
    content,
    updated_at
  )
  VALUES (
    v_task_id,
    NULL,
    p_story_title,
    p_story_status,
    p_story_content,
    p_story_updated_at
  )
  RETURNING id INTO v_story_id;

  INSERT INTO story_linear_links (
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
    v_story_id,
    p_linear_issue_id,
    p_linear_issue_identifier,
    p_story_updated_at,
    p_story_updated_at,
    'synced',
    NULL,
    NOW(),
    NOW()
  );

  RETURN QUERY SELECT false, v_story_id;
END;
$$;


-- =============================================================================
-- Retryable receipts and compare-and-swap Linear writeback
-- =============================================================================

DROP FUNCTION IF EXISTS apply_linear_issue_writeback_with_receipt(
  UUID,
  TEXT,
  TEXT,
  TIMESTAMPTZ,
  TIMESTAMPTZ,
  TIMESTAMPTZ,
  TEXT,
  TEXT,
  JSONB,
  TEXT,
  TEXT,
  TEXT,
  JSONB
);

CREATE FUNCTION apply_linear_issue_writeback_with_receipt(
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
  v_applied_updated_at TIMESTAMPTZ;
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

  UPDATE public.stories
  SET
    title = COALESCE(p_story_title, title),
    status = COALESCE(p_story_status, status),
    content = COALESCE(p_story_content, content)
  WHERE id = p_story_id
    AND updated_at = p_expected_story_updated_at
  RETURNING updated_at INTO v_applied_updated_at;

  IF v_applied_updated_at IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.stories WHERE id = p_story_id) THEN
      RAISE EXCEPTION 'Story not found';
    END IF;

    UPDATE public.integration_webhook_receipts
    SET
      status = 'ignored',
      error = 'Concurrent local update won conflict resolution',
      processed_at = NOW()
    WHERE id = v_receipt_id;

    RETURN QUERY SELECT false, false, true;
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

  RETURN QUERY SELECT false, true, false;
END;
$$;

CREATE OR REPLACE FUNCTION process_linear_issue_remove_with_receipt(
  p_story_id UUID,
  p_idempotency_key TEXT,
  p_event_type TEXT,
  p_event_action TEXT,
  p_payload JSONB
)
RETURNS TABLE (
  duplicate BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_receipt_id UUID;
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
    NOW()
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
    RETURN QUERY SELECT true;
    RETURN;
  END IF;

  DELETE FROM public.stories
  WHERE id = p_story_id;

  RETURN QUERY SELECT false;
END;
$$;


-- =============================================================================
-- RPC permissions
-- =============================================================================

REVOKE ALL ON FUNCTION import_linear_issue_into_story_map(
  UUID, TEXT, TEXT, TEXT, TEXT, JSONB, TIMESTAMPTZ, TEXT, TEXT, TEXT, JSONB
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION import_linear_issue_into_story_map(
  UUID, TEXT, TEXT, TEXT, TEXT, JSONB, TIMESTAMPTZ, TEXT, TEXT, TEXT, JSONB
) TO authenticated, service_role;

REVOKE ALL ON FUNCTION apply_linear_issue_writeback_with_receipt(
  UUID, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, JSONB, TEXT, TEXT, TEXT, JSONB
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION apply_linear_issue_writeback_with_receipt(
  UUID, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, JSONB, TEXT, TEXT, TEXT, JSONB
) TO service_role;

REVOKE ALL ON FUNCTION process_linear_issue_remove_with_receipt(UUID, TEXT, TEXT, TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION process_linear_issue_remove_with_receipt(UUID, TEXT, TEXT, TEXT, JSONB)
  TO service_role;

-- PostgREST caches function signatures. Explicitly refresh after replacing RPCs
-- so a clean local reset and deployed migration expose the new contracts immediately.
NOTIFY pgrst, 'reload schema';
