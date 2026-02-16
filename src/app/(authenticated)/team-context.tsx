'use client';

import { createContext, type ReactNode, useContext, useState } from 'react';
import type { TeamWithRole } from '@/types';

interface TeamContextValue {
  teams: TeamWithRole[];
  currentTeam: TeamWithRole | null;
  setCurrentTeam: (team: TeamWithRole) => void;
  reloadTeams: () => Promise<void>;
}

const TeamContext = createContext<TeamContextValue | null>(null);
const STORAGE_KEY = 'beemspec_current_team_id';

function getSavedOrFirstTeam(teams: TeamWithRole[]): TeamWithRole | null {
  if (typeof window === 'undefined') return teams[0] ?? null;
  const savedId = localStorage.getItem(STORAGE_KEY);
  return teams.find((t) => t.id === savedId) ?? teams[0] ?? null;
}

export function TeamProvider({ children, initialTeams }: { children: ReactNode; initialTeams: TeamWithRole[] }) {
  const [teams, setTeams] = useState(initialTeams);
  const [currentTeam, setCurrentTeamState] = useState(() => getSavedOrFirstTeam(initialTeams));

  function setCurrentTeam(team: TeamWithRole) {
    setCurrentTeamState(team);
    localStorage.setItem(STORAGE_KEY, team.id);
  }

  async function reloadTeams() {
    const res = await fetch('/api/teams');
    if (res.ok) {
      const list: TeamWithRole[] = await res.json();
      setTeams(list);
      setCurrentTeamState(getSavedOrFirstTeam(list));
    }
  }

  return (
    <TeamContext.Provider value={{ teams, currentTeam, setCurrentTeam, reloadTeams }}>{children}</TeamContext.Provider>
  );
}

export function useTeam() {
  const ctx = useContext(TeamContext);
  if (!ctx) throw new Error('useTeam must be used within TeamProvider');
  return ctx;
}
