-- =============================================================================
-- Story Map Kernel — Reference SQLite Schema
--
-- This is a reference implementation. Copy and adapt for your project.
-- The package has no runtime dependency on this schema.
-- =============================================================================

CREATE TABLE story_maps (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT
);

CREATE TABLE activities (
  id            TEXT PRIMARY KEY,
  story_map_id  TEXT NOT NULL REFERENCES story_maps(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT,
  sort_order    INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_activities_map ON activities(story_map_id);

CREATE TABLE tasks (
  id            TEXT PRIMARY KEY,
  activity_id   TEXT NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT,
  sort_order    INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_tasks_activity ON tasks(activity_id);

CREATE TABLE releases (
  id            TEXT PRIMARY KEY,
  story_map_id  TEXT NOT NULL REFERENCES story_maps(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT,
  sort_order    INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_releases_map ON releases(story_map_id);

CREATE TABLE stories (
  id            TEXT PRIMARY KEY,
  task_id       TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  release_id    TEXT REFERENCES releases(id) ON DELETE SET NULL,
  title         TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'backlog'
                  CHECK(status IN ('backlog', 'ready', 'in_progress', 'review', 'done')),
  content       TEXT NOT NULL DEFAULT '{"_version": 1, "requirements": "", "acceptance_criteria": ""}',
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT DEFAULT (datetime('now')),
  updated_at    TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_stories_task    ON stories(task_id);
CREATE INDEX idx_stories_release ON stories(release_id);
CREATE INDEX idx_stories_status  ON stories(status);
