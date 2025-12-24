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
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Activities (high-level journey phases - top of backbone)
CREATE TABLE activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_map_id UUID NOT NULL REFERENCES story_maps(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tasks (user actions under activities - second level of backbone)
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Releases (horizontal slices for grouping stories)
CREATE TABLE releases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_map_id UUID NOT NULL REFERENCES story_maps(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Stories (the actual implementation items)
CREATE TABLE stories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  release_id UUID REFERENCES releases(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  requirements TEXT NOT NULL,
  acceptance_criteria TEXT NOT NULL,
  figma_link TEXT,
  edge_cases TEXT,
  technical_guidelines TEXT,
  status TEXT DEFAULT 'backlog' CHECK(status IN ('backlog', 'ready', 'in_progress', 'review', 'done')),
  sort_order INTEGER DEFAULT 0,
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
