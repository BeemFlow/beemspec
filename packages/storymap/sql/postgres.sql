-- =============================================================================
-- Story Map Kernel — Reference PostgreSQL Schema
--
-- This is a reference implementation. Copy and adapt for your project.
-- The package has no runtime dependency on this schema.
-- =============================================================================

CREATE TABLE story_maps (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  description TEXT
);

CREATE TABLE activities (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_map_id  UUID NOT NULL REFERENCES story_maps(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT,
  sort_order    INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_activities_map ON activities(story_map_id);

CREATE TABLE tasks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id   UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT,
  sort_order    INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_tasks_activity ON tasks(activity_id);

CREATE TABLE releases (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_map_id  UUID NOT NULL REFERENCES story_maps(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT,
  sort_order    INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_releases_map ON releases(story_map_id);

CREATE TABLE stories (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id       UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  release_id    UUID REFERENCES releases(id) ON DELETE SET NULL,
  title         TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'backlog'
                  CHECK(status IN ('backlog', 'ready', 'in_progress', 'review', 'done')),
  content       JSONB NOT NULL DEFAULT '{"_version": 1, "requirements": "", "acceptance_criteria": ""}',
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_stories_task    ON stories(task_id);
CREATE INDEX idx_stories_release ON stories(release_id);
CREATE INDEX idx_stories_status  ON stories(status);
