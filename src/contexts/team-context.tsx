'use client';

import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';
import type { TeamWithRole } from '@/types';

interface TeamContextValue {
  teams: TeamWithRole[];
  currentTeam: TeamWithRole | null;
  setCurrentTeam: (team: TeamWithRole) => void;
  reloadTeams: () => Promise<void>;
}

const TeamContext = createContext<TeamContextValue | null>(null);
const TEAM_COOKIE_KEY = 'beemspec_current_team_id';

function getTeamByIdOrFirst(teams: TeamWithRole[], teamId: string | null): TeamWithRole | null {
  if (!teamId) return teams[0] ?? null;
  return teams.find((team) => team.id === teamId) ?? teams[0] ?? null;
}

function writeCurrentTeamCookie(teamId: string) {
  // biome-ignore lint/suspicious/noDocumentCookie: broad Cookie Store API support is not reliable enough for this app shell preference
  document.cookie = `${TEAM_COOKIE_KEY}=${encodeURIComponent(teamId)}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

export function TeamProvider({
  children,
  initialTeams,
  initialCurrentTeamId,
}: {
  children: ReactNode;
  initialTeams: TeamWithRole[];
  initialCurrentTeamId: string | null;
}) {
  const [teams, setTeams] = useState(initialTeams);
  const [currentTeam, setCurrentTeamState] = useState<TeamWithRole | null>(() =>
    getTeamByIdOrFirst(initialTeams, initialCurrentTeamId),
  );

  useEffect(() => {
    setTeams(initialTeams);
    setCurrentTeamState(getTeamByIdOrFirst(initialTeams, initialCurrentTeamId));
  }, [initialTeams, initialCurrentTeamId]);

  function setCurrentTeam(team: TeamWithRole) {
    setCurrentTeamState(team);
    writeCurrentTeamCookie(team.id);
  }

  async function reloadTeams() {
    const res = await fetch('/api/teams');
    if (res.ok) {
      const list: TeamWithRole[] = await res.json();
      setTeams(list);
      setCurrentTeamState((current) => getTeamByIdOrFirst(list, current?.id ?? initialCurrentTeamId));
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
