-- Allow team owners to manage member roles and remove other owners while
-- preserving the invariant that every team has at least one owner.

CREATE OR REPLACE FUNCTION public.update_team_member_role(
  p_team_id UUID,
  p_user_id UUID,
  p_role TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_caller_id UUID := (SELECT auth.uid());
  v_target_role TEXT;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_role NOT IN ('owner', 'member') THEN
    RETURN json_build_object('error', 'Invalid team role');
  END IF;

  -- Serialize owner-count changes for this team.
  PERFORM 1 FROM public.teams AS t WHERE t.id = p_team_id FOR UPDATE;

  IF NOT EXISTS (
    SELECT 1
    FROM public.team_members AS tm
    WHERE tm.team_id = p_team_id
      AND tm.user_id = v_caller_id
      AND tm.role = 'owner'
  ) THEN
    RETURN json_build_object('error', 'Only team owners can change member roles');
  END IF;

  SELECT tm.role
  INTO v_target_role
  FROM public.team_members AS tm
  WHERE tm.team_id = p_team_id
    AND tm.user_id = p_user_id;

  IF v_target_role IS NULL THEN
    RETURN json_build_object('error', 'Member not found');
  END IF;

  IF v_target_role = p_role THEN
    RETURN json_build_object('success', true, 'role', p_role);
  END IF;

  IF v_target_role = 'owner' AND p_role = 'member' AND NOT EXISTS (
    SELECT 1
    FROM public.team_members AS tm
    WHERE tm.team_id = p_team_id
      AND tm.user_id <> p_user_id
      AND tm.role = 'owner'
  ) THEN
    RETURN json_build_object('error', 'A team must have at least one owner');
  END IF;

  UPDATE public.team_members AS tm
  SET role = p_role
  WHERE tm.team_id = p_team_id
    AND tm.user_id = p_user_id;

  RETURN json_build_object('success', true, 'role', p_role);
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_team_member(p_team_id UUID, p_user_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_caller_id UUID := (SELECT auth.uid());
  v_target_role TEXT;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Serialize owner-count changes for this team.
  PERFORM 1 FROM public.teams AS t WHERE t.id = p_team_id FOR UPDATE;

  IF NOT EXISTS (
    SELECT 1
    FROM public.team_members AS tm
    WHERE tm.team_id = p_team_id
      AND tm.user_id = v_caller_id
      AND tm.role = 'owner'
  ) THEN
    RETURN json_build_object('error', 'Only team owners can remove members');
  END IF;

  SELECT tm.role
  INTO v_target_role
  FROM public.team_members AS tm
  WHERE tm.team_id = p_team_id
    AND tm.user_id = p_user_id;

  IF v_target_role IS NULL THEN
    RETURN json_build_object('error', 'Member not found');
  END IF;

  IF v_target_role = 'owner' AND NOT EXISTS (
    SELECT 1
    FROM public.team_members AS tm
    WHERE tm.team_id = p_team_id
      AND tm.user_id <> p_user_id
      AND tm.role = 'owner'
  ) THEN
    RETURN json_build_object('error', 'A team must have at least one owner');
  END IF;

  DELETE FROM public.team_members AS tm
  WHERE tm.team_id = p_team_id
    AND tm.user_id = p_user_id;

  RETURN json_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.update_team_member_role(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_team_member_role(UUID, UUID, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.remove_team_member(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_team_member(UUID, UUID) TO authenticated, service_role;
