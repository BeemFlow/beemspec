-- =============================================================================
-- Orchestration Jobs (Durable Worker Queue)
-- =============================================================================

CREATE TABLE orchestration_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_map_id UUID NOT NULL REFERENCES story_maps(id) ON DELETE CASCADE,
  release_run_id UUID REFERENCES release_runs(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('story_build', 'story_linear_sync')),
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 5 CHECK (max_attempts >= 1),
  last_error TEXT,
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_orchestration_jobs_status_available
  ON orchestration_jobs(status, available_at, created_at);

CREATE INDEX idx_orchestration_jobs_release_run
  ON orchestration_jobs(release_run_id)
  WHERE release_run_id IS NOT NULL;

ALTER TABLE orchestration_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can view orchestration jobs"
  ON orchestration_jobs FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM story_maps sm
    WHERE sm.id = story_map_id
      AND is_team_member(sm.team_id)
  ));

CREATE POLICY "Team members can create orchestration jobs"
  ON orchestration_jobs FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM story_maps sm
    WHERE sm.id = story_map_id
      AND is_team_member(sm.team_id)
  ));

CREATE POLICY "Team members can update orchestration jobs"
  ON orchestration_jobs FOR UPDATE
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

CREATE OR REPLACE FUNCTION update_orchestration_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_orchestration_jobs_updated_at
  BEFORE UPDATE ON orchestration_jobs
  FOR EACH ROW EXECUTE FUNCTION update_orchestration_jobs_updated_at();
