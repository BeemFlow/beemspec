-- =============================================================================
-- Release Runs (Phase 4 Foundation)
-- =============================================================================

CREATE TABLE release_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  release_id UUID NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
  story_map_id UUID NOT NULL REFERENCES story_maps(id) ON DELETE CASCADE,
  triggered_by UUID NOT NULL REFERENCES auth.users(id),
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  total_items INTEGER NOT NULL DEFAULT 0,
  completed_items INTEGER NOT NULL DEFAULT 0,
  failed_items INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_release_runs_release ON release_runs(release_id);
CREATE INDEX idx_release_runs_status ON release_runs(status);
CREATE INDEX idx_release_runs_created_at ON release_runs(created_at DESC);

CREATE TABLE release_run_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  release_run_id UUID NOT NULL REFERENCES release_runs(id) ON DELETE CASCADE,
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
  UNIQUE (release_run_id, story_id)
);

CREATE INDEX idx_release_run_items_run ON release_run_items(release_run_id);
CREATE INDEX idx_release_run_items_story ON release_run_items(story_id);
CREATE INDEX idx_release_run_items_status ON release_run_items(status);
CREATE INDEX idx_release_run_items_opencode_session_id ON release_run_items(opencode_session_id)
  WHERE opencode_session_id IS NOT NULL;

ALTER TABLE release_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE release_run_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can view release runs"
  ON release_runs FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM story_maps sm
    WHERE sm.id = story_map_id
      AND is_team_member(sm.team_id)
  ));

CREATE POLICY "Team members can create release runs"
  ON release_runs FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM story_maps sm
    WHERE sm.id = story_map_id
      AND is_team_member(sm.team_id)
  ));

CREATE POLICY "Team members can update release runs"
  ON release_runs FOR UPDATE
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

CREATE POLICY "Team members can view release run items"
  ON release_run_items FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM release_runs rr
    JOIN story_maps sm ON sm.id = rr.story_map_id
    WHERE rr.id = release_run_id
      AND is_team_member(sm.team_id)
  ));

CREATE POLICY "Team members can create release run items"
  ON release_run_items FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM release_runs rr
    JOIN story_maps sm ON sm.id = rr.story_map_id
    WHERE rr.id = release_run_id
      AND is_team_member(sm.team_id)
  ));

CREATE POLICY "Team members can update release run items"
  ON release_run_items FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM release_runs rr
    JOIN story_maps sm ON sm.id = rr.story_map_id
    WHERE rr.id = release_run_id
      AND is_team_member(sm.team_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM release_runs rr
    JOIN story_maps sm ON sm.id = rr.story_map_id
    WHERE rr.id = release_run_id
      AND is_team_member(sm.team_id)
  ));

CREATE OR REPLACE FUNCTION update_release_runs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_release_runs_updated_at
  BEFORE UPDATE ON release_runs
  FOR EACH ROW EXECUTE FUNCTION update_release_runs_updated_at();

CREATE OR REPLACE FUNCTION update_release_run_items_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_release_run_items_updated_at
  BEFORE UPDATE ON release_run_items
  FOR EACH ROW EXECUTE FUNCTION update_release_run_items_updated_at();
