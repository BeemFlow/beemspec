-- =============================================================================
-- BeemSpec Auth: RLS, Policies, Auth Functions
-- Depends on: 001_schema.sql
-- =============================================================================


-- =============================================================================
-- RLS Helper Functions
-- =============================================================================

CREATE OR REPLACE FUNCTION is_team_member(check_team_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM team_members
    WHERE team_id = check_team_id
    AND user_id = (SELECT auth.uid())
  )
$$;

CREATE OR REPLACE FUNCTION is_team_owner(check_team_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM team_members
    WHERE team_id = check_team_id
    AND user_id = (SELECT auth.uid())
    AND role = 'owner'
  )
$$;


-- =============================================================================
-- Enable RLS on all tables
-- =============================================================================

ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE story_maps ENABLE ROW LEVEL SECURITY;
ALTER TABLE personas ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE releases ENABLE ROW LEVEL SECURITY;
ALTER TABLE stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE story_personas ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_personas ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_personas ENABLE ROW LEVEL SECURITY;
ALTER TABLE story_linear_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE story_map_integration_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE linear_oauth_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_webhook_receipts ENABLE ROW LEVEL SECURITY;


-- =============================================================================
-- RLS Policies: Teams
-- =============================================================================

CREATE POLICY "Team members can view their teams"
  ON teams FOR SELECT
  USING (is_team_member(id));

CREATE POLICY "Team owners can update their teams"
  ON teams FOR UPDATE
  USING (is_team_owner(id))
  WITH CHECK (is_team_owner(id));

CREATE POLICY "Authenticated users can create teams"
  ON teams FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Team owners can delete teams"
  ON teams FOR DELETE
  USING (is_team_owner(id));


-- =============================================================================
-- RLS Policies: Team Members
-- =============================================================================

CREATE POLICY "Team members can view membership"
  ON team_members FOR SELECT
  USING (is_team_member(team_id));

CREATE POLICY "Team owners can add members or users can join via invite"
  ON team_members FOR INSERT
  TO authenticated
  WITH CHECK (
    is_team_owner(team_id)
    OR (
      user_id = (SELECT auth.uid()) AND role = 'owner'
    )
    OR (
      user_id = (SELECT auth.uid())
      AND role = 'member'
      AND EXISTS (
        SELECT 1 FROM team_invites
        WHERE team_id = team_members.team_id
        AND LOWER(email) = LOWER((SELECT email FROM auth.users WHERE id = auth.uid()))
        AND accepted_at IS NULL
      )
    )
  );

CREATE POLICY "Team owners can update members"
  ON team_members FOR UPDATE
  USING (is_team_owner(team_id))
  WITH CHECK (is_team_owner(team_id));

CREATE POLICY "Team owners can remove members or self-remove"
  ON team_members FOR DELETE
  USING (is_team_owner(team_id) OR user_id = (SELECT auth.uid()));


-- =============================================================================
-- RLS Policies: Team Invites
-- =============================================================================

CREATE POLICY "Team members can view invites"
  ON team_invites FOR SELECT
  USING (is_team_member(team_id));

CREATE POLICY "Team owners can create invites"
  ON team_invites FOR INSERT
  TO authenticated
  WITH CHECK (is_team_owner(team_id));

CREATE POLICY "Team owners can update invites"
  ON team_invites FOR UPDATE
  USING (is_team_owner(team_id))
  WITH CHECK (is_team_owner(team_id));

CREATE POLICY "Team owners can delete invites"
  ON team_invites FOR DELETE
  USING (is_team_owner(team_id));


-- =============================================================================
-- RLS Policies: Story Maps
-- =============================================================================

CREATE POLICY "Team members can view story maps"
  ON story_maps FOR SELECT
  USING (is_team_member(team_id));

CREATE POLICY "Team members can create story maps"
  ON story_maps FOR INSERT
  TO authenticated
  WITH CHECK (is_team_member(team_id));

CREATE POLICY "Team members can update story maps"
  ON story_maps FOR UPDATE
  USING (is_team_member(team_id))
  WITH CHECK (is_team_member(team_id));

CREATE POLICY "Team members can delete story maps"
  ON story_maps FOR DELETE
  USING (is_team_member(team_id));


-- =============================================================================
-- RLS Policies: Personas
-- =============================================================================

CREATE POLICY "Team members can view personas"
  ON personas FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM story_maps sm
    WHERE sm.id = story_map_id
    AND is_team_member(sm.team_id)
  ));

CREATE POLICY "Team members can create personas"
  ON personas FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM story_maps sm
    WHERE sm.id = story_map_id
    AND is_team_member(sm.team_id)
  ));

CREATE POLICY "Team members can update personas"
  ON personas FOR UPDATE
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

CREATE POLICY "Team members can delete personas"
  ON personas FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM story_maps sm
    WHERE sm.id = story_map_id
    AND is_team_member(sm.team_id)
  ));


-- =============================================================================
-- RLS Policies: Activities
-- =============================================================================

CREATE POLICY "Team members can view activities"
  ON activities FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM story_maps sm
    WHERE sm.id = story_map_id
    AND is_team_member(sm.team_id)
  ));

CREATE POLICY "Team members can create activities"
  ON activities FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM story_maps sm
    WHERE sm.id = story_map_id
    AND is_team_member(sm.team_id)
  ));

CREATE POLICY "Team members can update activities"
  ON activities FOR UPDATE
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

CREATE POLICY "Team members can delete activities"
  ON activities FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM story_maps sm
    WHERE sm.id = story_map_id
    AND is_team_member(sm.team_id)
  ));


-- =============================================================================
-- RLS Policies: Tasks
-- =============================================================================

CREATE POLICY "Team members can view tasks"
  ON tasks FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM activities a
    JOIN story_maps sm ON sm.id = a.story_map_id
    WHERE a.id = activity_id
    AND is_team_member(sm.team_id)
  ));

CREATE POLICY "Team members can create tasks"
  ON tasks FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM activities a
    JOIN story_maps sm ON sm.id = a.story_map_id
    WHERE a.id = activity_id
    AND is_team_member(sm.team_id)
  ));

CREATE POLICY "Team members can update tasks"
  ON tasks FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM activities a
    JOIN story_maps sm ON sm.id = a.story_map_id
    WHERE a.id = activity_id
    AND is_team_member(sm.team_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM activities a
    JOIN story_maps sm ON sm.id = a.story_map_id
    WHERE a.id = activity_id
    AND is_team_member(sm.team_id)
  ));

CREATE POLICY "Team members can delete tasks"
  ON tasks FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM activities a
    JOIN story_maps sm ON sm.id = a.story_map_id
    WHERE a.id = activity_id
    AND is_team_member(sm.team_id)
  ));


-- =============================================================================
-- RLS Policies: Releases
-- =============================================================================

CREATE POLICY "Team members can view releases"
  ON releases FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM story_maps sm
    WHERE sm.id = story_map_id
    AND is_team_member(sm.team_id)
  ));

CREATE POLICY "Team members can create releases"
  ON releases FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM story_maps sm
    WHERE sm.id = story_map_id
    AND is_team_member(sm.team_id)
  ));

CREATE POLICY "Team members can update releases"
  ON releases FOR UPDATE
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

CREATE POLICY "Team members can delete releases"
  ON releases FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM story_maps sm
    WHERE sm.id = story_map_id
    AND is_team_member(sm.team_id)
  ));


-- =============================================================================
-- RLS Policies: Stories
-- =============================================================================

CREATE POLICY "Team members can view stories"
  ON stories FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM tasks t
    JOIN activities a ON a.id = t.activity_id
    JOIN story_maps sm ON sm.id = a.story_map_id
    WHERE t.id = task_id
    AND is_team_member(sm.team_id)
  ));

CREATE POLICY "Team members can create stories"
  ON stories FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM tasks t
    JOIN activities a ON a.id = t.activity_id
    JOIN story_maps sm ON sm.id = a.story_map_id
    WHERE t.id = task_id
    AND is_team_member(sm.team_id)
  ));

CREATE POLICY "Team members can update stories"
  ON stories FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM tasks t
    JOIN activities a ON a.id = t.activity_id
    JOIN story_maps sm ON sm.id = a.story_map_id
    WHERE t.id = task_id
    AND is_team_member(sm.team_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM tasks t
    JOIN activities a ON a.id = t.activity_id
    JOIN story_maps sm ON sm.id = a.story_map_id
    WHERE t.id = task_id
    AND is_team_member(sm.team_id)
  ));

CREATE POLICY "Team members can delete stories"
  ON stories FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM tasks t
    JOIN activities a ON a.id = t.activity_id
    JOIN story_maps sm ON sm.id = a.story_map_id
    WHERE t.id = task_id
    AND is_team_member(sm.team_id)
  ));


-- =============================================================================
-- RLS Policies: Junction Tables
-- =============================================================================

-- Story Personas
CREATE POLICY "Team members can view story personas"
  ON story_personas FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM stories s
    JOIN tasks t ON t.id = s.task_id
    JOIN activities a ON a.id = t.activity_id
    JOIN story_maps sm ON sm.id = a.story_map_id
    WHERE s.id = story_id
    AND is_team_member(sm.team_id)
  ));

CREATE POLICY "Team members can manage story personas"
  ON story_personas FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM stories s
    JOIN tasks t ON t.id = s.task_id
    JOIN activities a ON a.id = t.activity_id
    JOIN story_maps sm ON sm.id = a.story_map_id
    WHERE s.id = story_id
    AND is_team_member(sm.team_id)
  ));

CREATE POLICY "Team members can delete story personas"
  ON story_personas FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM stories s
    JOIN tasks t ON t.id = s.task_id
    JOIN activities a ON a.id = t.activity_id
    JOIN story_maps sm ON sm.id = a.story_map_id
    WHERE s.id = story_id
    AND is_team_member(sm.team_id)
  ));

-- Activity Personas
CREATE POLICY "Team members can view activity personas"
  ON activity_personas FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM activities a
    JOIN story_maps sm ON sm.id = a.story_map_id
    WHERE a.id = activity_id
    AND is_team_member(sm.team_id)
  ));

CREATE POLICY "Team members can manage activity personas"
  ON activity_personas FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM activities a
    JOIN story_maps sm ON sm.id = a.story_map_id
    WHERE a.id = activity_id
    AND is_team_member(sm.team_id)
  ));

CREATE POLICY "Team members can delete activity personas"
  ON activity_personas FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM activities a
    JOIN story_maps sm ON sm.id = a.story_map_id
    WHERE a.id = activity_id
    AND is_team_member(sm.team_id)
  ));

-- Task Personas
CREATE POLICY "Team members can view task personas"
  ON task_personas FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM tasks t
    JOIN activities a ON a.id = t.activity_id
    JOIN story_maps sm ON sm.id = a.story_map_id
    WHERE t.id = task_id
    AND is_team_member(sm.team_id)
  ));

CREATE POLICY "Team members can manage task personas"
  ON task_personas FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM tasks t
    JOIN activities a ON a.id = t.activity_id
    JOIN story_maps sm ON sm.id = a.story_map_id
    WHERE t.id = task_id
    AND is_team_member(sm.team_id)
  ));

CREATE POLICY "Team members can delete task personas"
  ON task_personas FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM tasks t
    JOIN activities a ON a.id = t.activity_id
    JOIN story_maps sm ON sm.id = a.story_map_id
    WHERE t.id = task_id
    AND is_team_member(sm.team_id)
  ));


-- =============================================================================
-- RLS Policies: Story Linear Links
-- =============================================================================

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
-- RLS Policies: Integration Settings
-- =============================================================================

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


-- =============================================================================
-- RLS Policies: Story Map Integration Settings
-- =============================================================================

CREATE POLICY "Team members can view story map integration settings"
  ON story_map_integration_settings FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM story_maps sm
    WHERE sm.id = story_map_id
    AND is_team_member(sm.team_id)
  ));

CREATE POLICY "Team owners can create story map integration settings"
  ON story_map_integration_settings FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM story_maps sm
    WHERE sm.id = story_map_id
    AND is_team_owner(sm.team_id)
  ));

CREATE POLICY "Team owners can update story map integration settings"
  ON story_map_integration_settings FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM story_maps sm
    WHERE sm.id = story_map_id
    AND is_team_owner(sm.team_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM story_maps sm
    WHERE sm.id = story_map_id
    AND is_team_owner(sm.team_id)
  ));

CREATE POLICY "Team owners can delete story map integration settings"
  ON story_map_integration_settings FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM story_maps sm
    WHERE sm.id = story_map_id
    AND is_team_owner(sm.team_id)
  ));

-- =============================================================================
-- Auto-create Personal Team on Signup
-- =============================================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  new_team_id UUID;
  user_name TEXT;
BEGIN
  user_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    split_part(NEW.email, '@', 1)
  );

  INSERT INTO public.teams (name)
  VALUES (user_name || '''s Team')
  RETURNING id INTO new_team_id;

  INSERT INTO public.team_members (team_id, user_id, role)
  VALUES (new_team_id, NEW.id, 'owner');

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();


-- =============================================================================
-- Member Management Functions (SECURITY DEFINER for auth.users access)
-- =============================================================================

CREATE OR REPLACE FUNCTION get_team_members(p_team_id UUID)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  role TEXT,
  email TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE public.team_members.team_id = p_team_id
    AND public.team_members.user_id = (SELECT auth.uid())
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT
    tm.id,
    tm.user_id,
    tm.role,
    u.email::text,
    tm.created_at
  FROM public.team_members tm
  JOIN auth.users u ON u.id = tm.user_id
  WHERE tm.team_id = p_team_id
  ORDER BY tm.created_at;
END;
$$;

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
  ) AND v_caller_id != p_user_id THEN
    RAISE EXCEPTION 'Only team owners can remove other members';
  END IF;

  DELETE FROM public.team_members
  WHERE team_id = p_team_id AND user_id = p_user_id;

  RETURN json_build_object('success', true);
END;
$$;
