-- =============================================================================
-- BeemSpec Security Hardening: RLS Coverage, Policy Fixes, RPC Permissions
-- Depends on: 002_auth.sql, 003_functions.sql, 004_processflow.sql
-- =============================================================================


-- =============================================================================
-- Team member policy fixes
-- =============================================================================

DROP POLICY IF EXISTS "Team owners can add members or users can join via invite" ON team_members;

CREATE POLICY "Team owners can add members"
  ON team_members FOR INSERT
  TO authenticated
  WITH CHECK (is_team_owner(team_id));

DROP POLICY IF EXISTS "Team owners can remove members or self-remove" ON team_members;

CREATE POLICY "Team owners can remove non-owner members or non-owner self-remove"
  ON team_members FOR DELETE
  USING (
    role <> 'owner'
    AND (
      is_team_owner(team_id)
      OR user_id = (SELECT auth.uid())
    )
  );


-- =============================================================================
-- Process flow RLS enablement
-- =============================================================================

ALTER TABLE process_flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE process_flow_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE process_flow_edges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can view process flows"
  ON process_flows FOR SELECT
  USING (is_team_member(team_id));

CREATE POLICY "Team members can create process flows"
  ON process_flows FOR INSERT
  TO authenticated
  WITH CHECK (is_team_member(team_id));

CREATE POLICY "Team members can update process flows"
  ON process_flows FOR UPDATE
  USING (is_team_member(team_id))
  WITH CHECK (is_team_member(team_id));

CREATE POLICY "Team members can delete process flows"
  ON process_flows FOR DELETE
  USING (is_team_member(team_id));

CREATE POLICY "Team members can view process flow nodes"
  ON process_flow_nodes FOR SELECT
  USING (EXISTS (
    SELECT 1
    FROM process_flows pf
    WHERE pf.id = process_flow_id
      AND is_team_member(pf.team_id)
  ));

CREATE POLICY "Team members can create process flow nodes"
  ON process_flow_nodes FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1
    FROM process_flows pf
    WHERE pf.id = process_flow_id
      AND is_team_member(pf.team_id)
  ));

CREATE POLICY "Team members can update process flow nodes"
  ON process_flow_nodes FOR UPDATE
  USING (EXISTS (
    SELECT 1
    FROM process_flows pf
    WHERE pf.id = process_flow_id
      AND is_team_member(pf.team_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1
    FROM process_flows pf
    WHERE pf.id = process_flow_id
      AND is_team_member(pf.team_id)
  ));

CREATE POLICY "Team members can delete process flow nodes"
  ON process_flow_nodes FOR DELETE
  USING (EXISTS (
    SELECT 1
    FROM process_flows pf
    WHERE pf.id = process_flow_id
      AND is_team_member(pf.team_id)
  ));

CREATE POLICY "Team members can view process flow edges"
  ON process_flow_edges FOR SELECT
  USING (EXISTS (
    SELECT 1
    FROM process_flows pf
    WHERE pf.id = process_flow_id
      AND is_team_member(pf.team_id)
  ));

CREATE POLICY "Team members can create process flow edges"
  ON process_flow_edges FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1
    FROM process_flows pf
    WHERE pf.id = process_flow_id
      AND is_team_member(pf.team_id)
  ));

CREATE POLICY "Team members can update process flow edges"
  ON process_flow_edges FOR UPDATE
  USING (EXISTS (
    SELECT 1
    FROM process_flows pf
    WHERE pf.id = process_flow_id
      AND is_team_member(pf.team_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1
    FROM process_flows pf
    WHERE pf.id = process_flow_id
      AND is_team_member(pf.team_id)
  ));

CREATE POLICY "Team members can delete process flow edges"
  ON process_flow_edges FOR DELETE
  USING (EXISTS (
    SELECT 1
    FROM process_flows pf
    WHERE pf.id = process_flow_id
      AND is_team_member(pf.team_id)
  ));


-- =============================================================================
-- Persona junction integrity
-- =============================================================================

DROP POLICY IF EXISTS "Team members can manage story personas" ON story_personas;

CREATE POLICY "Team members can manage story personas"
  ON story_personas FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1
    FROM stories s
    JOIN tasks t ON t.id = s.task_id
    JOIN activities a ON a.id = t.activity_id
    JOIN personas p ON p.id = persona_id
    JOIN story_maps sm ON sm.id = a.story_map_id
    WHERE s.id = story_id
      AND p.story_map_id = a.story_map_id
      AND is_team_member(sm.team_id)
  ));

DROP POLICY IF EXISTS "Team members can manage activity personas" ON activity_personas;

CREATE POLICY "Team members can manage activity personas"
  ON activity_personas FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1
    FROM activities a
    JOIN personas p ON p.id = persona_id
    JOIN story_maps sm ON sm.id = a.story_map_id
    WHERE a.id = activity_id
      AND p.story_map_id = a.story_map_id
      AND is_team_member(sm.team_id)
  ));

DROP POLICY IF EXISTS "Team members can manage task personas" ON task_personas;

CREATE POLICY "Team members can manage task personas"
  ON task_personas FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1
    FROM tasks t
    JOIN activities a ON a.id = t.activity_id
    JOIN personas p ON p.id = persona_id
    JOIN story_maps sm ON sm.id = a.story_map_id
    WHERE t.id = task_id
      AND p.story_map_id = a.story_map_id
      AND is_team_member(sm.team_id)
  ));


-- =============================================================================
-- Move function invariants
-- =============================================================================

CREATE OR REPLACE FUNCTION move_task_and_reorder(
  p_task_id UUID,
  p_target_activity_id UUID,
  p_target_order UUID[]
)
RETURNS void AS $$
DECLARE
  v_current_story_map_id UUID;
  v_target_story_map_id UUID;
BEGIN
  IF NOT (p_task_id = ANY(p_target_order)) THEN
    RAISE EXCEPTION 'Target order must include moved task id';
  END IF;

  SELECT a.story_map_id
  INTO v_current_story_map_id
  FROM tasks t
  JOIN activities a ON a.id = t.activity_id
  WHERE t.id = p_task_id;

  IF v_current_story_map_id IS NULL THEN
    RAISE EXCEPTION 'Task not found';
  END IF;

  SELECT story_map_id
  INTO v_target_story_map_id
  FROM activities
  WHERE id = p_target_activity_id;

  IF v_target_story_map_id IS NULL THEN
    RAISE EXCEPTION 'Target activity not found';
  END IF;

  IF v_current_story_map_id <> v_target_story_map_id THEN
    RAISE EXCEPTION 'Task target activity must belong to the same story map';
  END IF;

  UPDATE tasks
  SET
    activity_id = p_target_activity_id,
    sort_order = NULL
  WHERE id = p_task_id;

  PERFORM reorder_tasks(p_target_activity_id, p_target_order);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION move_story_and_reorder(
  p_story_id UUID,
  p_target_task_id UUID,
  p_target_release_id UUID,
  p_target_order UUID[]
)
RETURNS void AS $$
DECLARE
  v_current_story_map_id UUID;
  v_target_story_map_id UUID;
BEGIN
  IF NOT (p_story_id = ANY(p_target_order)) THEN
    RAISE EXCEPTION 'Target order must include moved story id';
  END IF;

  SELECT a.story_map_id
  INTO v_current_story_map_id
  FROM stories s
  JOIN tasks t ON t.id = s.task_id
  JOIN activities a ON a.id = t.activity_id
  WHERE s.id = p_story_id;

  IF v_current_story_map_id IS NULL THEN
    RAISE EXCEPTION 'Story not found';
  END IF;

  SELECT a.story_map_id
  INTO v_target_story_map_id
  FROM tasks t
  JOIN activities a ON a.id = t.activity_id
  WHERE t.id = p_target_task_id;

  IF v_target_story_map_id IS NULL THEN
    RAISE EXCEPTION 'Target task not found';
  END IF;

  IF v_current_story_map_id <> v_target_story_map_id THEN
    RAISE EXCEPTION 'Story target task must belong to the same story map';
  END IF;

  UPDATE stories
  SET
    task_id = p_target_task_id,
    release_id = p_target_release_id,
    sort_order = NULL
  WHERE id = p_story_id;

  PERFORM reorder_stories(p_target_task_id, p_target_release_id, p_target_order);
END;
$$ LANGUAGE plpgsql;


-- =============================================================================
-- Security definer hardening
-- =============================================================================

CREATE OR REPLACE FUNCTION remove_team_member(p_team_id UUID, p_user_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_caller_id UUID;
  v_target_role TEXT;
BEGIN
  v_caller_id := (SELECT auth.uid());

  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT role INTO v_target_role
  FROM public.team_members
  WHERE team_id = p_team_id AND user_id = p_user_id;

  IF v_target_role IS NULL THEN
    RETURN json_build_object('error', 'Member not found');
  END IF;

  IF v_target_role = 'owner' THEN
    RETURN json_build_object('error', 'Cannot remove team owner');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_id = p_team_id
      AND user_id = v_caller_id
      AND role = 'owner'
  ) AND v_caller_id <> p_user_id THEN
    RAISE EXCEPTION 'Only team owners can remove other members';
  END IF;

  DELETE FROM public.team_members
  WHERE team_id = p_team_id AND user_id = p_user_id;

  RETURN json_build_object('success', true);
END;
$$;


-- =============================================================================
-- RPC execute permissions
-- =============================================================================

REVOKE ALL ON FUNCTION public.get_team_members(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_team_members(UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.remove_team_member(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_team_member(UUID, UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.create_team_with_owner(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_team_with_owner(TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.accept_team_invite_member(UUID, UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_team_invite_member(UUID, UUID, UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.reorder_releases(UUID, UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reorder_releases(UUID, UUID[]) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.reorder_activities(UUID, UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reorder_activities(UUID, UUID[]) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.reorder_tasks(UUID, UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reorder_tasks(UUID, UUID[]) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.reorder_stories(UUID, UUID, UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reorder_stories(UUID, UUID, UUID[]) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.move_task_and_reorder(UUID, UUID, UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.move_task_and_reorder(UUID, UUID, UUID[]) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.move_story_and_reorder(UUID, UUID, UUID, UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.move_story_and_reorder(UUID, UUID, UUID, UUID[]) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.batch_mutate_process_flow_nodes(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.batch_mutate_process_flow_nodes(UUID, JSONB) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.batch_mutate_process_flow_edges(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.batch_mutate_process_flow_edges(UUID, JSONB) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.apply_process_flow_layout(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_process_flow_layout(UUID, JSONB) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.process_linear_issue_remove_with_receipt(UUID, TEXT, TEXT, TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_linear_issue_remove_with_receipt(UUID, TEXT, TEXT, TEXT, JSONB)
  TO service_role;

REVOKE ALL ON FUNCTION public.apply_linear_issue_writeback_with_receipt(
  UUID,
  TEXT,
  TEXT,
  TIMESTAMPTZ,
  TIMESTAMPTZ,
  TIMESTAMPTZ,
  TEXT,
  TEXT,
  JSONB,
  TEXT,
  TEXT,
  TEXT,
  JSONB
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_linear_issue_writeback_with_receipt(
  UUID,
  TEXT,
  TEXT,
  TIMESTAMPTZ,
  TIMESTAMPTZ,
  TIMESTAMPTZ,
  TEXT,
  TEXT,
  JSONB,
  TEXT,
  TEXT,
  TEXT,
  JSONB
) TO service_role;

REVOKE ALL ON FUNCTION public.disconnect_linear_for_team(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.disconnect_linear_for_team(UUID) TO service_role;
