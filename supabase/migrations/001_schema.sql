-- =============================================================================
-- BeemSpec Schema: Tables & Indexes
-- =============================================================================


-- =============================================================================
-- Teams & Membership
-- =============================================================================

CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(team_id, user_id)
);

CREATE INDEX idx_team_members_team ON team_members(team_id);
CREATE INDEX idx_team_members_user ON team_members(user_id);

CREATE TABLE team_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  invited_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  UNIQUE(team_id, email)
);

CREATE INDEX idx_team_invites_team ON team_invites(team_id);
CREATE INDEX idx_team_invites_email ON team_invites(email);


-- =============================================================================
-- Story Maps
-- =============================================================================

CREATE TABLE story_maps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_story_maps_team ON story_maps(team_id);


-- =============================================================================
-- Personas
-- =============================================================================

CREATE TABLE personas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_map_id UUID NOT NULL REFERENCES story_maps(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  goals TEXT,
  sort_order INTEGER DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_personas_story_map ON personas(story_map_id);


-- =============================================================================
-- Activities
-- =============================================================================

CREATE TABLE activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_map_id UUID NOT NULL REFERENCES story_maps(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_activities_story_map ON activities(story_map_id);


-- =============================================================================
-- Tasks
-- =============================================================================

CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tasks_activity ON tasks(activity_id);


-- =============================================================================
-- Releases
-- =============================================================================

CREATE TABLE releases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_map_id UUID NOT NULL REFERENCES story_maps(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_releases_story_map ON releases(story_map_id);


-- =============================================================================
-- Stories
-- =============================================================================

CREATE TABLE stories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  release_id UUID REFERENCES releases(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  status TEXT DEFAULT 'backlog' CHECK(status IN ('backlog', 'ready', 'in_progress', 'review', 'done')),
  content JSONB NOT NULL DEFAULT '{"_version": 1, "requirements": "", "acceptance_criteria": ""}',
  sort_order INTEGER DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_stories_task ON stories(task_id);
CREATE INDEX idx_stories_release ON stories(release_id);
CREATE INDEX idx_stories_status ON stories(status);


-- =============================================================================
-- Persona Junction Tables
-- =============================================================================

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


-- =============================================================================
-- Story <-> Linear Links
-- =============================================================================

CREATE TABLE story_linear_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id UUID NOT NULL UNIQUE REFERENCES stories(id) ON DELETE CASCADE,
  linear_issue_id TEXT NOT NULL UNIQUE,
  linear_issue_identifier TEXT,
  last_local_updated_at TIMESTAMPTZ,
  last_linear_updated_at TIMESTAMPTZ,
  sync_state TEXT NOT NULL DEFAULT 'synced' CHECK (sync_state IN ('synced', 'error')),
  sync_error TEXT,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_story_linear_links_story ON story_linear_links(story_id);
CREATE INDEX idx_story_linear_links_linear_issue ON story_linear_links(linear_issue_id);


-- =============================================================================
-- Integration Settings
-- =============================================================================

CREATE TABLE integration_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL UNIQUE REFERENCES teams(id) ON DELETE CASCADE,
  linear_workspace_id TEXT,
  linear_team_id TEXT,
  linear_project_id TEXT,
  linear_state_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_integration_settings_team ON integration_settings(team_id);


-- =============================================================================
-- Linear OAuth Connections
-- =============================================================================

CREATE TABLE linear_oauth_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL UNIQUE REFERENCES teams(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_type TEXT,
  scope TEXT,
  expires_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_linear_oauth_connections_team ON linear_oauth_connections(team_id);


-- =============================================================================
-- Webhook Receipts
-- =============================================================================

CREATE TABLE integration_webhook_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  event_type TEXT,
  event_action TEXT,
  status TEXT NOT NULL DEFAULT 'processed' CHECK (status IN ('processed', 'ignored', 'failed')),
  error TEXT,
  payload JSONB,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, idempotency_key)
);

CREATE INDEX idx_integration_webhook_receipts_provider ON integration_webhook_receipts(provider);
CREATE INDEX idx_integration_webhook_receipts_received_at ON integration_webhook_receipts(received_at);


-- =============================================================================
-- Build Runs
-- =============================================================================

CREATE TABLE build_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  release_id UUID REFERENCES releases(id) ON DELETE SET NULL,
  story_map_id UUID NOT NULL REFERENCES story_maps(id) ON DELETE CASCADE,
  triggered_by UUID NOT NULL REFERENCES auth.users(id),
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  total_items INTEGER NOT NULL DEFAULT 0,
  completed_items INTEGER NOT NULL DEFAULT 0,
  failed_items INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  working_directory TEXT,
  opencode_session_id TEXT,
  opencode_session_url TEXT,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_build_runs_release ON build_runs(release_id);
CREATE INDEX idx_build_runs_status ON build_runs(status);
CREATE INDEX idx_build_runs_created_at ON build_runs(created_at DESC);
CREATE INDEX idx_build_runs_opencode_session_id ON build_runs(opencode_session_id)
  WHERE opencode_session_id IS NOT NULL;

CREATE TABLE build_run_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  build_run_id UUID NOT NULL REFERENCES build_runs(id) ON DELETE CASCADE,
  story_id UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  linear_issue_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'synced', 'failed')),
  error TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
  last_retry_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (build_run_id, story_id)
);

CREATE INDEX idx_build_run_items_run ON build_run_items(build_run_id);
CREATE INDEX idx_build_run_items_story ON build_run_items(story_id);
CREATE INDEX idx_build_run_items_status ON build_run_items(status);
