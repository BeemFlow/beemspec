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
