-- Add an already-registered auth user to a team without sending a Supabase
-- account invitation. The email lookup stays inside the database so auth.users
-- is never exposed to the application client.

CREATE OR REPLACE FUNCTION public.add_registered_user_to_team(
  p_invite_id UUID,
  p_team_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_invite_email TEXT;
  v_user_id UUID;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF NOT public.is_team_owner(p_team_id) THEN
    RAISE EXCEPTION 'Only team owners can add registered users';
  END IF;

  SELECT email
  INTO v_invite_email
  FROM public.team_invites
  WHERE id = p_invite_id
    AND team_id = p_team_id
    AND accepted_at IS NULL;

  IF v_invite_email IS NULL THEN
    RAISE EXCEPTION 'Invite not found';
  END IF;

  SELECT id
  INTO v_user_id
  FROM auth.users
  WHERE lower(email) = lower(v_invite_email)
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  INSERT INTO public.team_members (team_id, user_id, role)
  VALUES (p_team_id, v_user_id, 'member')
  ON CONFLICT (team_id, user_id) DO NOTHING;

  UPDATE public.team_invites
  SET accepted_at = NOW()
  WHERE id = p_invite_id
    AND team_id = p_team_id;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.add_registered_user_to_team(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_registered_user_to_team(UUID, UUID) TO authenticated, service_role;
