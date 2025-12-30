-- =============================================================================
-- Database Functions for Atomic Operations
-- =============================================================================

-- -----------------------------------------------------------------------------
-- delete_release: Atomically delete a release and all its stories
-- -----------------------------------------------------------------------------
-- Raises exception with ERRCODE 'P0002' if release not found
CREATE OR REPLACE FUNCTION delete_release(p_release_id UUID)
RETURNS void AS $$
DECLARE
  v_deleted INT;
BEGIN
  -- Delete associated stories first
  DELETE FROM stories WHERE release_id = p_release_id;

  -- Delete the release
  DELETE FROM releases WHERE id = p_release_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  -- Raise if release didn't exist
  IF v_deleted = 0 THEN
    RAISE EXCEPTION 'Release not found' USING ERRCODE = 'P0002';
  END IF;
END;
$$ LANGUAGE plpgsql;

-- -----------------------------------------------------------------------------
-- reorder_releases: Atomically reorder releases within a story map
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION reorder_releases(p_story_map_id UUID, p_order UUID[])
RETURNS void AS $$
BEGIN
  UPDATE releases
  SET sort_order = array_position(p_order, id) - 1
  WHERE story_map_id = p_story_map_id AND id = ANY(p_order);
END;
$$ LANGUAGE plpgsql;

-- -----------------------------------------------------------------------------
-- reorder_activities: Atomically reorder activities within a story map
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION reorder_activities(p_story_map_id UUID, p_order UUID[])
RETURNS void AS $$
BEGIN
  UPDATE activities
  SET sort_order = array_position(p_order, id) - 1
  WHERE story_map_id = p_story_map_id AND id = ANY(p_order);
END;
$$ LANGUAGE plpgsql;

-- -----------------------------------------------------------------------------
-- reorder_tasks: Atomically reorder tasks within an activity
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION reorder_tasks(p_activity_id UUID, p_order UUID[])
RETURNS void AS $$
BEGIN
  UPDATE tasks
  SET sort_order = array_position(p_order, id) - 1
  WHERE activity_id = p_activity_id AND id = ANY(p_order);
END;
$$ LANGUAGE plpgsql;

-- -----------------------------------------------------------------------------
-- reorder_stories: Atomically reorder stories within a task+release cell
-- -----------------------------------------------------------------------------
-- Uses IS NOT DISTINCT FROM to handle NULL release_id (unassigned stories)
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
