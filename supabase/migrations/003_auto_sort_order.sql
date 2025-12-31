-- =============================================================================
-- Auto Sort Order Triggers
-- Automatically calculates sort_order on INSERT when not provided
-- =============================================================================

-- First, change column defaults from 0 to NULL so triggers can detect missing values
-- (PostgreSQL applies DEFAULT before BEFORE INSERT triggers run)
ALTER TABLE releases ALTER COLUMN sort_order SET DEFAULT NULL;
ALTER TABLE activities ALTER COLUMN sort_order SET DEFAULT NULL;
ALTER TABLE tasks ALTER COLUMN sort_order SET DEFAULT NULL;
ALTER TABLE personas ALTER COLUMN sort_order SET DEFAULT NULL;
ALTER TABLE stories ALTER COLUMN sort_order SET DEFAULT NULL;

-- -----------------------------------------------------------------------------
-- Releases: parent = story_map_id
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- Activities: parent = story_map_id
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- Tasks: parent = activity_id
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- Personas: parent = story_map_id
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- Stories: compound parent = task_id + release_id (with NULL handling)
-- Uses IS NOT DISTINCT FROM to properly handle NULL release_id
-- -----------------------------------------------------------------------------
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
