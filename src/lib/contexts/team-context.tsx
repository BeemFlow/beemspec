'use client';

import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { TeamWithRole } from '@/types';

interface TeamContextValue {
  teams: TeamWithRole[];
  currentTeam: TeamWithRole | null;
  setCurrentTeam: (team: TeamWithRole) => void;
  loading: boolean;
}

const TeamContext = createContext<TeamContextValue | null>(null);
const STORAGE_KEY = 'beemspec_current_team_id';

export function TeamProvider({ children }: { children: ReactNode }) {
  const [teams, setTeams] = useState<TeamWithRole[]>([]);
  const [currentTeam, setCurrentTeamState] = useState<TeamWithRole | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const loadTeams = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return setLoading(false);

    const { data } = await supabase
      .from('team_members')
      .select('role, teams(id, name, created_at, updated_at)')
      .order('created_at');

    if (!data) return setLoading(false);

    type TeamRow = { id: string; name: string; created_at: string; updated_at: string };
    const list: TeamWithRole[] = data
      .filter((m) => m.teams)
      .map((m) => {
        const t = m.teams as unknown as TeamRow;
        return {
          id: t.id,
          name: t.name,
          created_at: t.created_at,
          updated_at: t.updated_at,
          role: m.role as TeamWithRole['role'],
        };
      });

    setTeams(list);
    const savedId = localStorage.getItem(STORAGE_KEY);
    setCurrentTeamState(list.find((t) => t.id === savedId) ?? list[0] ?? null);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    loadTeams();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') loadTeams();
    });
    return () => subscription.unsubscribe();
  }, [loadTeams, supabase.auth]);

  const setCurrentTeam = (team: TeamWithRole) => {
    setCurrentTeamState(team);
    localStorage.setItem(STORAGE_KEY, team.id);
  };

  return (
    <TeamContext.Provider value={{ teams, currentTeam, setCurrentTeam, loading }}>{children}</TeamContext.Provider>
  );
}

export function useTeam() {
  const context = useContext(TeamContext);
  if (!context) throw new Error('useTeam must be used within TeamProvider');
  return context;
}
