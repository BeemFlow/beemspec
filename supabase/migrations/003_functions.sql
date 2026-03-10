-- =============================================================================
-- BeemSpec Functions: Reorder, Triggers, Build Run RPCs
-- Depends on: 001_schema.sql
-- =============================================================================


-- =============================================================================
-- Reorder Functions
-- =============================================================================

CREATE OR REPLACE FUNCTION reorder_releases(p_story_map_id UUID, p_order UUID[])
RETURNS void AS $$
DECLARE
  v_target_count INTEGER;
  v_sibling_count INTEGER;
  v_unique_count INTEGER;
BEGIN
  IF p_order IS NULL OR array_length(p_order, 1) IS NULL OR array_length(p_order, 1) = 0 THEN
    RAISE EXCEPTION 'Order array cannot be empty';
  END IF;

  SELECT COUNT(*), COUNT(DISTINCT id)
  INTO v_target_count, v_unique_count
  FROM unnest(p_order) AS id;

  IF v_unique_count <> v_target_count THEN
    RAISE EXCEPTION 'Order array contains duplicate ids';
  END IF;

  SELECT COUNT(*)
  INTO v_sibling_count
  FROM releases
  WHERE story_map_id = p_story_map_id;

  IF v_sibling_count <> v_target_count THEN
    RAISE EXCEPTION 'Order array must contain all sibling ids';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM releases
    WHERE story_map_id = p_story_map_id
      AND id <> ALL(p_order)
  ) THEN
    RAISE EXCEPTION 'Order array includes ids outside target siblings';
  END IF;

  UPDATE releases
  SET sort_order = -(array_position(p_order, id))
  WHERE story_map_id = p_story_map_id;

  UPDATE releases
  SET sort_order = ABS(sort_order) - 1
  WHERE story_map_id = p_story_map_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION reorder_activities(p_story_map_id UUID, p_order UUID[])
RETURNS void AS $$
DECLARE
  v_target_count INTEGER;
  v_sibling_count INTEGER;
  v_unique_count INTEGER;
BEGIN
  IF p_order IS NULL OR array_length(p_order, 1) IS NULL OR array_length(p_order, 1) = 0 THEN
    RAISE EXCEPTION 'Order array cannot be empty';
  END IF;

  SELECT COUNT(*), COUNT(DISTINCT id)
  INTO v_target_count, v_unique_count
  FROM unnest(p_order) AS id;

  IF v_unique_count <> v_target_count THEN
    RAISE EXCEPTION 'Order array contains duplicate ids';
  END IF;

  SELECT COUNT(*)
  INTO v_sibling_count
  FROM activities
  WHERE story_map_id = p_story_map_id;

  IF v_sibling_count <> v_target_count THEN
    RAISE EXCEPTION 'Order array must contain all sibling ids';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM activities
    WHERE story_map_id = p_story_map_id
      AND id <> ALL(p_order)
  ) THEN
    RAISE EXCEPTION 'Order array includes ids outside target siblings';
  END IF;

  UPDATE activities
  SET sort_order = -(array_position(p_order, id))
  WHERE story_map_id = p_story_map_id;

  UPDATE activities
  SET sort_order = ABS(sort_order) - 1
  WHERE story_map_id = p_story_map_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION reorder_tasks(p_activity_id UUID, p_order UUID[])
RETURNS void AS $$
DECLARE
  v_target_count INTEGER;
  v_sibling_count INTEGER;
  v_unique_count INTEGER;
BEGIN
  IF p_order IS NULL OR array_length(p_order, 1) IS NULL OR array_length(p_order, 1) = 0 THEN
    RAISE EXCEPTION 'Order array cannot be empty';
  END IF;

  SELECT COUNT(*), COUNT(DISTINCT id)
  INTO v_target_count, v_unique_count
  FROM unnest(p_order) AS id;

  IF v_unique_count <> v_target_count THEN
    RAISE EXCEPTION 'Order array contains duplicate ids';
  END IF;

  SELECT COUNT(*)
  INTO v_sibling_count
  FROM tasks
  WHERE activity_id = p_activity_id;

  IF v_sibling_count <> v_target_count THEN
    RAISE EXCEPTION 'Order array must contain all sibling ids';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM tasks
    WHERE activity_id = p_activity_id
      AND id <> ALL(p_order)
  ) THEN
    RAISE EXCEPTION 'Order array includes ids outside target siblings';
  END IF;

  UPDATE tasks
  SET sort_order = -(array_position(p_order, id))
  WHERE activity_id = p_activity_id;

  UPDATE tasks
  SET sort_order = ABS(sort_order) - 1
  WHERE activity_id = p_activity_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION reorder_stories(
  p_task_id UUID,
  p_release_id UUID,
  p_order UUID[]
)
RETURNS void AS $$
DECLARE
  v_target_count INTEGER;
  v_sibling_count INTEGER;
  v_unique_count INTEGER;
BEGIN
  IF p_order IS NULL OR array_length(p_order, 1) IS NULL OR array_length(p_order, 1) = 0 THEN
    RAISE EXCEPTION 'Order array cannot be empty';
  END IF;

  SELECT COUNT(*), COUNT(DISTINCT id)
  INTO v_target_count, v_unique_count
  FROM unnest(p_order) AS id;

  IF v_unique_count <> v_target_count THEN
    RAISE EXCEPTION 'Order array contains duplicate ids';
  END IF;

  SELECT COUNT(*)
  INTO v_sibling_count
  FROM stories
  WHERE task_id = p_task_id
    AND release_id IS NOT DISTINCT FROM p_release_id;

  IF v_sibling_count <> v_target_count THEN
    RAISE EXCEPTION 'Order array must contain all sibling ids';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM stories
    WHERE task_id = p_task_id
      AND release_id IS NOT DISTINCT FROM p_release_id
      AND id <> ALL(p_order)
  ) THEN
    RAISE EXCEPTION 'Order array includes ids outside target siblings';
  END IF;

  UPDATE stories
  SET sort_order = -(array_position(p_order, id))
  WHERE task_id = p_task_id
    AND release_id IS NOT DISTINCT FROM p_release_id;

  UPDATE stories
  SET sort_order = ABS(sort_order) - 1
  WHERE task_id = p_task_id
    AND release_id IS NOT DISTINCT FROM p_release_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION move_persona_to_sort_order(
  p_persona_id UUID,
  p_target_sort_order INTEGER
)
RETURNS void AS $$
DECLARE
  v_story_map_id UUID;
  v_current_sort_order INTEGER;
  v_max_sort_order INTEGER;
  v_target_sort_order INTEGER;
BEGIN
  IF p_target_sort_order IS NULL THEN
    RAISE EXCEPTION 'Target sort order cannot be null';
  END IF;

  SELECT story_map_id, sort_order
  INTO v_story_map_id, v_current_sort_order
  FROM personas
  WHERE id = p_persona_id;

  IF v_story_map_id IS NULL THEN
    RAISE EXCEPTION 'Persona not found';
  END IF;

  SELECT COALESCE(MAX(sort_order), 0)
  INTO v_max_sort_order
  FROM personas
  WHERE story_map_id = v_story_map_id;

  v_target_sort_order = GREATEST(0, LEAST(p_target_sort_order, v_max_sort_order));

  IF v_current_sort_order = v_target_sort_order THEN
    RETURN;
  END IF;

  UPDATE personas
  SET sort_order = -1
  WHERE id = p_persona_id;

  IF v_target_sort_order < v_current_sort_order THEN
    UPDATE personas
    SET sort_order = sort_order + 1
    WHERE story_map_id = v_story_map_id
      AND id <> p_persona_id
      AND sort_order >= v_target_sort_order
      AND sort_order < v_current_sort_order;
  ELSE
    UPDATE personas
    SET sort_order = sort_order - 1
    WHERE story_map_id = v_story_map_id
      AND id <> p_persona_id
      AND sort_order <= v_target_sort_order
      AND sort_order > v_current_sort_order;
  END IF;

  UPDATE personas
  SET sort_order = v_target_sort_order
  WHERE id = p_persona_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION move_task_and_reorder(
  p_task_id UUID,
  p_target_activity_id UUID,
  p_target_order UUID[]
)
RETURNS void AS $$
BEGIN
  IF NOT (p_task_id = ANY(p_target_order)) THEN
    RAISE EXCEPTION 'Target order must include moved task id';
  END IF;

  UPDATE tasks
  SET
    activity_id = p_target_activity_id,
    sort_order = NULL
  WHERE id = p_task_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found';
  END IF;

  PERFORM reorder_tasks(p_target_activity_id, p_target_order);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION move_story_and_reorder(
  p_story_id UUID,
  p_target_task_id UUID,
  p_target_release_id UUID,
  p_target_order UUID[]
)
RETURNS void AS $$
BEGIN
  IF NOT (p_story_id = ANY(p_target_order)) THEN
    RAISE EXCEPTION 'Target order must include moved story id';
  END IF;

  UPDATE stories
  SET
    task_id = p_target_task_id,
    release_id = p_target_release_id,
    sort_order = NULL
  WHERE id = p_story_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Story not found';
  END IF;

  PERFORM reorder_stories(p_target_task_id, p_target_release_id, p_target_order);
END;
$$ LANGUAGE plpgsql;


-- =============================================================================
-- Auto Sort Order Triggers
-- =============================================================================

CREATE OR REPLACE FUNCTION auto_sort_order_releases()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.sort_order IS NULL THEN
    SELECT COALESCE(MAX(sort_order), -1) + 1 INTO NEW.sort_order
    FROM releases WHERE story_map_id = NEW.story_map_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_auto_sort_order_releases
  BEFORE INSERT ON releases
  FOR EACH ROW EXECUTE FUNCTION auto_sort_order_releases();

CREATE OR REPLACE FUNCTION auto_sort_order_activities()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.sort_order IS NULL THEN
    SELECT COALESCE(MAX(sort_order), -1) + 1 INTO NEW.sort_order
    FROM activities WHERE story_map_id = NEW.story_map_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_auto_sort_order_activities
  BEFORE INSERT ON activities
  FOR EACH ROW EXECUTE FUNCTION auto_sort_order_activities();

CREATE OR REPLACE FUNCTION auto_sort_order_tasks()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.sort_order IS NULL THEN
    SELECT COALESCE(MAX(sort_order), -1) + 1 INTO NEW.sort_order
    FROM tasks WHERE activity_id = NEW.activity_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_auto_sort_order_tasks
  BEFORE INSERT ON tasks
  FOR EACH ROW EXECUTE FUNCTION auto_sort_order_tasks();

CREATE OR REPLACE FUNCTION auto_sort_order_personas()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.sort_order IS NULL THEN
    SELECT COALESCE(MAX(sort_order), -1) + 1 INTO NEW.sort_order
    FROM personas WHERE story_map_id = NEW.story_map_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_auto_sort_order_personas
  BEFORE INSERT ON personas
  FOR EACH ROW EXECUTE FUNCTION auto_sort_order_personas();

CREATE OR REPLACE FUNCTION auto_sort_order_stories()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.sort_order IS NULL THEN
    SELECT COALESCE(MAX(sort_order), -1) + 1 INTO NEW.sort_order
    FROM stories
    WHERE task_id = NEW.task_id
      AND release_id IS NOT DISTINCT FROM NEW.release_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_auto_sort_order_stories
  BEFORE INSERT ON stories
  FOR EACH ROW EXECUTE FUNCTION auto_sort_order_stories();

CREATE OR REPLACE FUNCTION enforce_story_parent_consistency()
RETURNS TRIGGER AS $$
DECLARE
  v_task_story_map_id UUID;
  v_release_story_map_id UUID;
BEGIN
  SELECT a.story_map_id
  INTO v_task_story_map_id
  FROM tasks t
  JOIN activities a ON a.id = t.activity_id
  WHERE t.id = NEW.task_id;

  IF v_task_story_map_id IS NULL THEN
    RAISE EXCEPTION 'Task for story not found';
  END IF;

  IF NEW.release_id IS NOT NULL THEN
    SELECT r.story_map_id
    INTO v_release_story_map_id
    FROM releases r
    WHERE r.id = NEW.release_id;

    IF v_release_story_map_id IS NULL THEN
      RAISE EXCEPTION 'Release for story not found';
    END IF;

    IF v_release_story_map_id <> v_task_story_map_id THEN
      RAISE EXCEPTION 'Story task and release must belong to the same story map';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_enforce_story_parent_consistency
  BEFORE INSERT OR UPDATE OF task_id, release_id ON stories
  FOR EACH ROW EXECUTE FUNCTION enforce_story_parent_consistency();


-- =============================================================================
-- Updated-at Triggers
-- =============================================================================

CREATE OR REPLACE FUNCTION update_teams_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_teams_updated_at
  BEFORE UPDATE ON teams
  FOR EACH ROW EXECUTE FUNCTION update_teams_updated_at();

CREATE OR REPLACE FUNCTION update_integration_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_integration_settings_updated_at
  BEFORE UPDATE ON integration_settings
  FOR EACH ROW EXECUTE FUNCTION update_integration_settings_updated_at();

CREATE OR REPLACE FUNCTION update_story_map_integration_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_story_map_integration_settings_updated_at
  BEFORE UPDATE ON story_map_integration_settings
  FOR EACH ROW EXECUTE FUNCTION update_story_map_integration_settings_updated_at();

CREATE OR REPLACE FUNCTION update_linear_oauth_connections_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_linear_oauth_connections_updated_at
  BEFORE UPDATE ON linear_oauth_connections
  FOR EACH ROW EXECUTE FUNCTION update_linear_oauth_connections_updated_at();

CREATE OR REPLACE FUNCTION update_story_maps_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_story_maps_updated_at
  BEFORE UPDATE ON story_maps
  FOR EACH ROW EXECUTE FUNCTION update_story_maps_updated_at();

CREATE OR REPLACE FUNCTION update_stories_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_stories_updated_at
  BEFORE UPDATE ON stories
  FOR EACH ROW EXECUTE FUNCTION update_stories_updated_at();


-- =============================================================================
-- Linear Webhook Atomic Write Functions
-- =============================================================================

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
    payload
  )
  VALUES (
    'linear',
    p_idempotency_key,
    p_event_type,
    p_event_action,
    'processed',
    p_payload
  )
  ON CONFLICT (provider, idempotency_key) DO NOTHING
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

CREATE OR REPLACE FUNCTION apply_linear_issue_writeback_with_receipt(
  p_story_id UUID,
  p_linear_issue_id TEXT,
  p_linear_issue_identifier TEXT,
  p_last_local_updated_at TIMESTAMPTZ,
  p_last_linear_updated_at TIMESTAMPTZ,
  p_story_updated_at TIMESTAMPTZ,
  p_story_title TEXT,
  p_story_status TEXT,
  p_story_content JSONB,
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
  v_now TIMESTAMPTZ := NOW();
BEGIN
  INSERT INTO public.integration_webhook_receipts (
    provider,
    idempotency_key,
    event_type,
    event_action,
    status,
    payload
  )
  VALUES (
    'linear',
    p_idempotency_key,
    p_event_type,
    p_event_action,
    'processed',
    p_payload
  )
  ON CONFLICT (provider, idempotency_key) DO NOTHING
  RETURNING id INTO v_receipt_id;

  IF v_receipt_id IS NULL THEN
    RETURN QUERY SELECT true;
    RETURN;
  END IF;

  UPDATE public.stories
  SET
    updated_at = p_story_updated_at,
    title = COALESCE(p_story_title, title),
    status = COALESCE(p_story_status, status),
    content = COALESCE(p_story_content, content)
  WHERE id = p_story_id;

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
    p_last_local_updated_at,
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

  RETURN QUERY SELECT false;
END;
$$;
