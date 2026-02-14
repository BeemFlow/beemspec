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
