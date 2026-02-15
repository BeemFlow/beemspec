-- =============================================================================
-- Build Runs (Phase 4 Foundation)
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
  opencode_session_id TEXT,
  opencode_session_url TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
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
  opencode_session_id TEXT,
  opencode_session_url TEXT,
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
CREATE INDEX idx_build_run_items_opencode_session_id ON build_run_items(opencode_session_id)
  WHERE opencode_session_id IS NOT NULL;

ALTER TABLE build_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE build_run_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can view build runs"
  ON build_runs FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM story_maps sm
    WHERE sm.id = story_map_id
      AND is_team_member(sm.team_id)
  ));

CREATE POLICY "Team members can create build runs"
  ON build_runs FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM story_maps sm
    WHERE sm.id = story_map_id
      AND is_team_member(sm.team_id)
  ));

CREATE POLICY "Team members can update build runs"
  ON build_runs FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM story_maps sm
    WHERE sm.id = story_map_id
      AND is_team_member(sm.team_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM story_maps sm
    WHERE sm.id = story_map_id
      AND is_team_member(sm.team_id)
  ));

CREATE POLICY "Team members can view build run items"
  ON build_run_items FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM build_runs rr
    JOIN story_maps sm ON sm.id = rr.story_map_id
    WHERE rr.id = build_run_id
      AND is_team_member(sm.team_id)
  ));

CREATE POLICY "Team members can create build run items"
  ON build_run_items FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM build_runs rr
    JOIN story_maps sm ON sm.id = rr.story_map_id
    WHERE rr.id = build_run_id
      AND is_team_member(sm.team_id)
  ));

CREATE POLICY "Team members can update build run items"
  ON build_run_items FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM build_runs rr
    JOIN story_maps sm ON sm.id = rr.story_map_id
    WHERE rr.id = build_run_id
      AND is_team_member(sm.team_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM build_runs rr
    JOIN story_maps sm ON sm.id = rr.story_map_id
    WHERE rr.id = build_run_id
      AND is_team_member(sm.team_id)
  ));

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
