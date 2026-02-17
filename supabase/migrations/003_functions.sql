-- =============================================================================
-- BeemSpec Functions: Reorder, Triggers, Build Run RPCs
-- Depends on: 001_schema.sql
-- =============================================================================


-- =============================================================================
-- Reorder Functions
-- =============================================================================

CREATE OR REPLACE FUNCTION reorder_releases(p_story_map_id UUID, p_order UUID[])
RETURNS void AS $$
BEGIN
  UPDATE releases
  SET sort_order = array_position(p_order, id) - 1
  WHERE story_map_id = p_story_map_id AND id = ANY(p_order);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION reorder_activities(p_story_map_id UUID, p_order UUID[])
RETURNS void AS $$
BEGIN
  UPDATE activities
  SET sort_order = array_position(p_order, id) - 1
  WHERE story_map_id = p_story_map_id AND id = ANY(p_order);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION reorder_tasks(p_activity_id UUID, p_order UUID[])
RETURNS void AS $$
BEGIN
  UPDATE tasks
  SET sort_order = array_position(p_order, id) - 1
  WHERE activity_id = p_activity_id AND id = ANY(p_order);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION reorder_stories(
  p_task_id UUID,
  p_release_id UUID,
  p_order UUID[]
)
RETURNS void AS $$
BEGIN
  UPDATE stories
  SET sort_order = array_position(p_order, id) - 1
  WHERE task_id = p_task_id
    AND release_id IS NOT DISTINCT FROM p_release_id
    AND id = ANY(p_order);
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

CREATE OR REPLACE FUNCTION update_build_runs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_build_runs_updated_at
  BEFORE UPDATE ON build_runs
  FOR EACH ROW EXECUTE FUNCTION update_build_runs_updated_at();

CREATE OR REPLACE FUNCTION update_build_run_items_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_build_run_items_updated_at
  BEFORE UPDATE ON build_run_items
  FOR EACH ROW EXECUTE FUNCTION update_build_run_items_updated_at();


-- =============================================================================
-- Build Run RPCs (inline processing, no worker queue)
-- =============================================================================

CREATE OR REPLACE FUNCTION create_build_run_with_items(
  p_release_id UUID,
  p_story_map_id UUID,
  p_triggered_by UUID,
  p_story_ids UUID[]
)
RETURNS TABLE (
  run_id UUID,
  created_story_ids UUID[],
  total_items INTEGER
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_run_id UUID;
  v_distinct_story_ids UUID[] := ARRAY[]::UUID[];
  v_inserted_story_ids UUID[] := ARRAY[]::UUID[];
BEGIN
  -- Deduplicate input
  SELECT COALESCE(array_agg(story_id), ARRAY[]::UUID[])
  INTO v_distinct_story_ids
  FROM (
    SELECT DISTINCT story_id
    FROM unnest(COALESCE(p_story_ids, ARRAY[]::UUID[])) AS story_id
    WHERE story_id IS NOT NULL
  ) deduped;

  -- Create the run
  INSERT INTO build_runs (
    release_id,
    story_map_id,
    triggered_by,
    status,
    total_items,
    completed_items,
    failed_items
  )
  VALUES (
    p_release_id,
    p_story_map_id,
    p_triggered_by,
    'queued',
    0,
    0,
    0
  )
  RETURNING id INTO v_run_id;

  -- Insert items, skip duplicates
  WITH inserted AS (
    INSERT INTO build_run_items (build_run_id, story_id, status, error)
    SELECT v_run_id, story_id, 'pending', NULL
    FROM unnest(v_distinct_story_ids) AS story_id
    ON CONFLICT (build_run_id, story_id) DO NOTHING
    RETURNING story_id
  )
  SELECT COALESCE(array_agg(story_id), ARRAY[]::UUID[])
  INTO v_inserted_story_ids
  FROM inserted;

  -- Update run totals
  UPDATE build_runs
  SET total_items = cardinality(v_inserted_story_ids)
  WHERE id = v_run_id;

  -- If nothing was inserted, mark completed immediately
  IF cardinality(v_inserted_story_ids) = 0 THEN
    UPDATE build_runs
    SET status = 'completed', finished_at = NOW()
    WHERE id = v_run_id;
  END IF;

  RETURN QUERY
  SELECT v_run_id, v_inserted_story_ids, cardinality(v_inserted_story_ids)::INTEGER;
END;
$$;

CREATE OR REPLACE FUNCTION append_build_run_items(
  p_build_run_id UUID,
  p_story_ids UUID[]
)
RETURNS TABLE (
  appended_items INTEGER,
  total_items INTEGER
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_distinct_story_ids UUID[] := ARRAY[]::UUID[];
  v_inserted_story_ids UUID[] := ARRAY[]::UUID[];
  v_new_total INTEGER;
BEGIN
  -- Deduplicate input
  SELECT COALESCE(array_agg(story_id), ARRAY[]::UUID[])
  INTO v_distinct_story_ids
  FROM (
    SELECT DISTINCT story_id
    FROM unnest(COALESCE(p_story_ids, ARRAY[]::UUID[])) AS story_id
    WHERE story_id IS NOT NULL
  ) deduped;

  -- Lock the run
  PERFORM 1 FROM build_runs WHERE id = p_build_run_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Build run % not found', p_build_run_id;
  END IF;

  -- Insert new items only
  WITH inserted AS (
    INSERT INTO build_run_items (build_run_id, story_id, status, error)
    SELECT p_build_run_id, story_id, 'pending', NULL
    FROM unnest(v_distinct_story_ids) AS story_id
    ON CONFLICT (build_run_id, story_id) DO NOTHING
    RETURNING story_id
  )
  SELECT COALESCE(array_agg(story_id), ARRAY[]::UUID[])
  INTO v_inserted_story_ids
  FROM inserted;

  -- Update run totals
  UPDATE build_runs
  SET total_items = total_items + cardinality(v_inserted_story_ids)
  WHERE id = p_build_run_id;

  SELECT br.total_items INTO v_new_total
  FROM build_runs br
  WHERE br.id = p_build_run_id;

  RETURN QUERY
  SELECT cardinality(v_inserted_story_ids)::INTEGER, v_new_total;
END;
$$;
