-- =============================================================================
-- BeemSpec Database Schema
-- =============================================================================

-- Story Maps (containers for the entire map)
CREATE TABLE story_maps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Personas (user types)
CREATE TABLE personas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_map_id UUID NOT NULL REFERENCES story_maps(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  goals TEXT,
  sort_order INTEGER DEFAULT NULL,  -- NULL triggers auto-calculation
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Activities (high-level journey phases - top of backbone)
CREATE TABLE activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_map_id UUID NOT NULL REFERENCES story_maps(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER DEFAULT NULL,  -- NULL triggers auto-calculation
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tasks (user actions under activities - second level of backbone)
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER DEFAULT NULL,  -- NULL triggers auto-calculation
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Releases (horizontal slices for grouping stories)
CREATE TABLE releases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_map_id UUID NOT NULL REFERENCES story_maps(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER DEFAULT NULL,  -- NULL triggers auto-calculation
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Stories (the actual implementation items)
-- release_id uses CASCADE: deleting a release deletes all stories in it
CREATE TABLE stories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  release_id UUID REFERENCES releases(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  requirements TEXT NOT NULL,
  acceptance_criteria TEXT NOT NULL,
  figma_link TEXT,
  edge_cases TEXT,
  technical_guidelines TEXT,
  status TEXT DEFAULT 'backlog' CHECK(status IN ('backlog', 'ready', 'in_progress', 'review', 'done')),
  sort_order INTEGER DEFAULT NULL,  -- NULL triggers auto-calculation
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Junction tables for personas
CREATE TABLE story_personas (
  story_id UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  persona_id UUID NOT NULL REFERENCES personas(id) ON DELETE CASCADE,
  PRIMARY KEY (story_id, persona_id)
);

CREATE TABLE activity_personas (
  activity_id UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  persona_id UUID NOT NULL REFERENCES personas(id) ON DELETE CASCADE,
  PRIMARY KEY (activity_id, persona_id)
);

CREATE TABLE task_personas (
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  persona_id UUID NOT NULL REFERENCES personas(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, persona_id)
);

-- Indexes for common queries
CREATE INDEX idx_activities_story_map ON activities(story_map_id);
CREATE INDEX idx_tasks_activity ON tasks(activity_id);
CREATE INDEX idx_stories_task ON stories(task_id);
CREATE INDEX idx_stories_release ON stories(release_id);
CREATE INDEX idx_stories_status ON stories(status);
CREATE INDEX idx_personas_story_map ON personas(story_map_id);
CREATE INDEX idx_releases_story_map ON releases(story_map_id);


-- =============================================================================
-- Database Functions for Atomic Operations
-- =============================================================================

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


-- =============================================================================
-- Auto Sort Order Triggers
-- Automatically calculates sort_order on INSERT when not provided (NULL)
-- =============================================================================

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
