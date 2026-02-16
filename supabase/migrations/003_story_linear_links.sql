-- =============================================================================
-- Story <-> Linear Link Mapping
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

ALTER TABLE story_linear_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can view story linear links"
  ON story_linear_links FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM stories s
    JOIN tasks t ON t.id = s.task_id
    JOIN activities a ON a.id = t.activity_id
    JOIN story_maps sm ON sm.id = a.story_map_id
    WHERE s.id = story_id
    AND is_team_member(sm.team_id)
  ));

CREATE POLICY "Team members can create story linear links"
  ON story_linear_links FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM stories s
    JOIN tasks t ON t.id = s.task_id
    JOIN activities a ON a.id = t.activity_id
    JOIN story_maps sm ON sm.id = a.story_map_id
    WHERE s.id = story_id
    AND is_team_member(sm.team_id)
  ));

CREATE POLICY "Team members can update story linear links"
  ON story_linear_links FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM stories s
    JOIN tasks t ON t.id = s.task_id
    JOIN activities a ON a.id = t.activity_id
    JOIN story_maps sm ON sm.id = a.story_map_id
    WHERE s.id = story_id
    AND is_team_member(sm.team_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM stories s
    JOIN tasks t ON t.id = s.task_id
    JOIN activities a ON a.id = t.activity_id
    JOIN story_maps sm ON sm.id = a.story_map_id
    WHERE s.id = story_id
    AND is_team_member(sm.team_id)
  ));

CREATE POLICY "Team members can delete story linear links"
  ON story_linear_links FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM stories s
    JOIN tasks t ON t.id = s.task_id
    JOIN activities a ON a.id = t.activity_id
    JOIN story_maps sm ON sm.id = a.story_map_id
    WHERE s.id = story_id
    AND is_team_member(sm.team_id)
  ));

-- =============================================================================
-- Team Integration Settings
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

ALTER TABLE integration_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can view integration settings"
  ON integration_settings FOR SELECT
  USING (is_team_member(team_id));

CREATE POLICY "Team owners can create integration settings"
  ON integration_settings FOR INSERT
  TO authenticated
  WITH CHECK (is_team_owner(team_id));

CREATE POLICY "Team owners can update integration settings"
  ON integration_settings FOR UPDATE
  USING (is_team_owner(team_id))
  WITH CHECK (is_team_owner(team_id));

CREATE POLICY "Team owners can delete integration settings"
  ON integration_settings FOR DELETE
  USING (is_team_owner(team_id));

CREATE OR REPLACE FUNCTION update_integration_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_integration_settings_updated_at
  BEFORE UPDATE ON integration_settings
  FOR EACH ROW EXECUTE FUNCTION update_integration_settings_updated_at();

-- =============================================================================
-- Integration Webhook Receipts (Idempotency)
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

CREATE INDEX idx_integration_webhook_receipts_provider
  ON integration_webhook_receipts(provider);

CREATE INDEX idx_integration_webhook_receipts_received_at
  ON integration_webhook_receipts(received_at);

ALTER TABLE integration_webhook_receipts ENABLE ROW LEVEL SECURITY;

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

-- =============================================================================
-- Worker Jobs
-- =============================================================================

CREATE TABLE worker_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_map_id UUID NOT NULL REFERENCES story_maps(id) ON DELETE CASCADE,
  build_run_id UUID REFERENCES build_runs(id) ON DELETE CASCADE,
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

CREATE INDEX idx_worker_jobs_status_available
  ON worker_jobs(status, available_at, created_at);

CREATE INDEX idx_worker_jobs_build_run
  ON worker_jobs(build_run_id)
  WHERE build_run_id IS NOT NULL;

ALTER TABLE worker_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can view worker jobs"
  ON worker_jobs FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM story_maps sm
    WHERE sm.id = story_map_id
      AND is_team_member(sm.team_id)
  ));

CREATE POLICY "Team members can create worker jobs"
  ON worker_jobs FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM story_maps sm
    WHERE sm.id = story_map_id
      AND is_team_member(sm.team_id)
  ));

CREATE POLICY "Team members can update worker jobs"
  ON worker_jobs FOR UPDATE
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

CREATE OR REPLACE FUNCTION update_worker_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_worker_jobs_updated_at
  BEFORE UPDATE ON worker_jobs
  FOR EACH ROW EXECUTE FUNCTION update_worker_jobs_updated_at();

-- =============================================================================
-- Build Run Queue Functions (Atomic enqueue + run updates)
-- =============================================================================

CREATE OR REPLACE FUNCTION enqueue_build_run_story_job(
  p_build_run_id UUID,
  p_release_id UUID,
  p_story_map_id UUID,
  p_story_ids UUID[],
  p_queue_existing BOOLEAN DEFAULT false
)
RETURNS TABLE (
  build_run_id UUID,
  job_id UUID,
  queued_story_ids UUID[],
  queued_items INTEGER,
  appended_items INTEGER
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_distinct_story_ids UUID[] := ARRAY[]::UUID[];
  v_inserted_story_ids UUID[] := ARRAY[]::UUID[];
  v_queued_story_ids UUID[] := ARRAY[]::UUID[];
  v_job_id UUID;
BEGIN
  SELECT COALESCE(array_agg(story_id), ARRAY[]::UUID[])
  INTO v_distinct_story_ids
  FROM (
    SELECT DISTINCT story_id
    FROM unnest(COALESCE(p_story_ids, ARRAY[]::UUID[])) AS story_id
    WHERE story_id IS NOT NULL
  ) deduped;

  PERFORM 1
  FROM build_runs
  WHERE id = p_build_run_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Build run % not found', p_build_run_id;
  END IF;

  WITH inserted AS (
    INSERT INTO build_run_items (build_run_id, story_id, status, error)
    SELECT p_build_run_id, story_id, 'pending', NULL
    FROM unnest(v_distinct_story_ids) AS story_id
    ON CONFLICT (build_run_id, story_id) DO NOTHING
    RETURNING story_id
  )
  SELECT COALESCE(array_agg(story_id), ARRAY[]::UUID[])
  INTO v_inserted_story_ids
  FROM inserted;

  IF p_queue_existing THEN
    v_queued_story_ids := v_distinct_story_ids;
  ELSE
    v_queued_story_ids := v_inserted_story_ids;
  END IF;

  IF cardinality(v_queued_story_ids) = 0 THEN
    RETURN QUERY
    SELECT
      p_build_run_id,
      NULL::UUID,
      v_queued_story_ids,
      0,
      cardinality(v_inserted_story_ids);
    RETURN;
  END IF;

  UPDATE build_runs
  SET
    status = 'queued',
    error = NULL,
    total_items = total_items + cardinality(v_inserted_story_ids)
  WHERE id = p_build_run_id;

  INSERT INTO worker_jobs (
    story_map_id,
    build_run_id,
    kind,
    status,
    payload,
    available_at
  )
  VALUES (
    p_story_map_id,
    p_build_run_id,
    'story_build',
    'queued',
    jsonb_build_object(
      'release_id', p_release_id,
      'build_run_id', p_build_run_id,
      'story_map_id', p_story_map_id,
      'story_ids', v_queued_story_ids
    ),
    NOW()
  )
  RETURNING id INTO v_job_id;

  RETURN QUERY
  SELECT
    p_build_run_id,
    v_job_id,
    v_queued_story_ids,
    cardinality(v_queued_story_ids),
    cardinality(v_inserted_story_ids);
END;
$$;

CREATE OR REPLACE FUNCTION create_build_run_with_story_job(
  p_release_id UUID,
  p_story_map_id UUID,
  p_triggered_by UUID,
  p_story_ids UUID[]
)
RETURNS TABLE (
  run_id UUID,
  job_id UUID,
  queued_story_ids UUID[],
  queued_items INTEGER
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_run_id UUID;
  v_job_id UUID;
  v_queued_story_ids UUID[] := ARRAY[]::UUID[];
  v_queued_items INTEGER := 0;
BEGIN
  INSERT INTO build_runs (
    release_id,
    story_map_id,
    triggered_by,
    status,
    total_items,
    completed_items,
    failed_items,
    started_at
  )
  VALUES (
    p_release_id,
    p_story_map_id,
    p_triggered_by,
    'queued',
    0,
    0,
    0,
    NOW()
  )
  RETURNING id INTO v_run_id;

  SELECT result.job_id, result.queued_story_ids, result.queued_items
  INTO v_job_id, v_queued_story_ids, v_queued_items
  FROM enqueue_build_run_story_job(
    v_run_id,
    p_release_id,
    p_story_map_id,
    p_story_ids,
    false
  ) AS result;

  IF v_queued_items = 0 THEN
    UPDATE build_runs
    SET
      status = 'completed',
      error = NULL,
      finished_at = NOW()
    WHERE id = v_run_id;
  END IF;

  RETURN QUERY
  SELECT v_run_id, v_job_id, v_queued_story_ids, v_queued_items;
END;
$$;

CREATE OR REPLACE FUNCTION requeue_build_run_retry_job(
  p_build_run_id UUID,
  p_release_id UUID,
  p_story_map_id UUID,
  p_story_ids UUID[]
)
RETURNS TABLE (
  job_id UUID,
  queued_items INTEGER
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_distinct_story_ids UUID[] := ARRAY[]::UUID[];
  v_job_id UUID;
BEGIN
  SELECT COALESCE(array_agg(story_id), ARRAY[]::UUID[])
  INTO v_distinct_story_ids
  FROM (
    SELECT DISTINCT story_id
    FROM unnest(COALESCE(p_story_ids, ARRAY[]::UUID[])) AS story_id
    WHERE story_id IS NOT NULL
  ) deduped;

  PERFORM 1
  FROM build_runs
  WHERE id = p_build_run_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Build run % not found', p_build_run_id;
  END IF;

  IF cardinality(v_distinct_story_ids) = 0 THEN
    RETURN QUERY SELECT NULL::UUID, 0;
    RETURN;
  END IF;

  UPDATE build_runs
  SET
    status = 'queued',
    error = NULL
  WHERE id = p_build_run_id;

  INSERT INTO worker_jobs (
    story_map_id,
    build_run_id,
    kind,
    status,
    payload,
    available_at
  )
  VALUES (
    p_story_map_id,
    p_build_run_id,
    'story_build',
    'queued',
    jsonb_build_object(
      'release_id', p_release_id,
      'build_run_id', p_build_run_id,
      'story_map_id', p_story_map_id,
      'story_ids', v_distinct_story_ids
    ),
    NOW()
  )
  RETURNING id INTO v_job_id;

  RETURN QUERY SELECT v_job_id, cardinality(v_distinct_story_ids);
END;
$$;
