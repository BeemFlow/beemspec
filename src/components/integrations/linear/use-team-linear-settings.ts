import { useCallback, useEffect, useState } from 'react';
import type { StoryStatus } from '@/domain/story-map';
import { errorMessage } from '@/lib/errors';
import { fetchJson } from '@/lib/http';

const STORY_STATUSES: StoryStatus[] = ['backlog', 'todo', 'in_progress', 'in_review', 'done'];

export type LinearStatus =
  | { type: 'idle' }
  | { type: 'loading' }
  | { type: 'success'; message: string }
  | { type: 'error'; message: string };

interface LinearIntegrationSettings {
  linear_workspace_id: string | null;
  linear_team_id: string | null;
  linear_status_mapping?: Partial<Record<StoryStatus, string>>;
}

export interface LinearTeamSummary {
  settings: LinearIntegrationSettings | null;
  connection: {
    connected: boolean;
    expires_at: string | null;
    scope: string | null;
  };
}

interface LinearTeamOption {
  id: string;
  name: string;
  key: string | null;
}

interface LinearStateOption {
  id: string;
  name: string;
  type: string | null;
  teamId: string;
}

interface LinearOptionsPayload {
  settings: LinearIntegrationSettings | null;
  options: {
    workspace_id: string | null;
    workspace_name: string | null;
    teams: LinearTeamOption[];
    states: LinearStateOption[];
  };
  applied_defaults: boolean;
}

interface UseTeamLinearSettingsParams {
  open: boolean;
  integrationsActive: boolean;
  teamId: string | undefined;
  isOwner: boolean;
  summary: LinearTeamSummary | null;
  oauthNotice: { status: 'success' | 'error'; reason?: string } | null;
  onOAuthNoticeHandled?: () => void;
  onOAuthNoticeReceived: () => void;
  resolveOAuthStatus: (input: { status: 'success' | 'error'; reason?: string }) => LinearStatus;
  refreshTeamSettings: () => Promise<void>;
}

export interface UseTeamLinearSettingsReturn {
  linearStatus: LinearStatus;
  savingLinearSettings: boolean;
  disconnectingLinear: boolean;
  linearWorkspaceId: string;
  linearWorkspaceName: string;
  linearTeamId: string;
  setLinearTeamId: (value: string) => void;
  linearStatusMapping: Partial<Record<StoryStatus, string>>;
  setLinearStatusMappingValue: (status: StoryStatus, value: string) => void;
  linearConnected: boolean;
  linearScope: string | null;
  linearExpiresAt: string | null;
  linearOptionsLoading: boolean;
  linearTeamOptions: LinearTeamOption[];
  linearStateOptions: LinearStateOption[];
  handleConnectLinear: () => void;
  handleDisconnectLinear: () => Promise<void>;
  handleSaveLinearSettings: (event: React.FormEvent) => Promise<void>;
}

function asInputValue(value: string | null | undefined): string {
  return value ?? '';
}

function asNullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeStatusMapping(
  value: Partial<Record<StoryStatus, string>> | null | undefined,
): Partial<Record<StoryStatus, string>> {
  const normalized: Partial<Record<StoryStatus, string>> = {};
  for (const status of STORY_STATUSES) {
    const item = asNullable(value?.[status] ?? '');
    if (item) normalized[status] = item;
  }
  return normalized;
}

export function useTeamLinearSettings({
  open,
  integrationsActive,
  teamId,
  isOwner,
  summary,
  oauthNotice,
  onOAuthNoticeHandled,
  onOAuthNoticeReceived,
  resolveOAuthStatus,
  refreshTeamSettings,
}: UseTeamLinearSettingsParams): UseTeamLinearSettingsReturn {
  const [linearStatus, setLinearStatus] = useState<LinearStatus>({ type: 'idle' });
  const [savingLinearSettings, setSavingLinearSettings] = useState(false);
  const [disconnectingLinear, setDisconnectingLinear] = useState(false);
  const [linearWorkspaceId, setLinearWorkspaceId] = useState('');
  const [linearWorkspaceName, setLinearWorkspaceName] = useState('');
  const [linearTeamId, setLinearTeamIdState] = useState('');
  const [linearStatusMapping, setLinearStatusMapping] = useState<Partial<Record<StoryStatus, string>>>({});
  const [linearConnected, setLinearConnected] = useState(false);
  const [linearScope, setLinearScope] = useState<string | null>(null);
  const [linearExpiresAt, setLinearExpiresAt] = useState<string | null>(null);
  const [linearOptionsLoading, setLinearOptionsLoading] = useState(false);
  const [linearTeamOptions, setLinearTeamOptions] = useState<LinearTeamOption[]>([]);
  const [linearStateOptions, setLinearStateOptions] = useState<LinearStateOption[]>([]);

  const loadLinearOptions = useCallback(async (inputTeamId: string) => {
    setLinearOptionsLoading(true);
    try {
      const data = await fetchJson<LinearOptionsPayload>(
        `/api/teams/${inputTeamId}/integrations/linear/options`,
        undefined,
        'Failed to fetch Linear options',
      );
      setLinearWorkspaceId(asInputValue(data.settings?.linear_workspace_id ?? data.options.workspace_id));
      setLinearWorkspaceName(asInputValue(data.options.workspace_name));
      setLinearTeamIdState(asInputValue(data.settings?.linear_team_id));
      setLinearStatusMapping(normalizeStatusMapping(data.settings?.linear_status_mapping));
      setLinearTeamOptions(data.options.teams ?? []);
      setLinearStateOptions(data.options.states ?? []);
      if (data.applied_defaults) {
        setLinearStatus({ type: 'success', message: 'Linear defaults configured automatically' });
      }
    } catch (error) {
      setLinearStatus({ type: 'error', message: errorMessage(error) });
    } finally {
      setLinearOptionsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!summary) return;
    setLinearWorkspaceId(asInputValue(summary.settings?.linear_workspace_id));
    setLinearWorkspaceName('');
    setLinearTeamIdState(asInputValue(summary.settings?.linear_team_id));
    setLinearStatusMapping(normalizeStatusMapping(summary.settings?.linear_status_mapping));
    setLinearConnected(summary.connection.connected);
    setLinearScope(summary.connection.scope ?? null);
    setLinearExpiresAt(summary.connection.expires_at ?? null);
    if (!summary.connection.connected) {
      setLinearTeamOptions([]);
      setLinearStateOptions([]);
    }
  }, [summary]);

  useEffect(() => {
    if (!open || !integrationsActive || !teamId || !isOwner || !linearConnected) return;
    void loadLinearOptions(teamId);
  }, [integrationsActive, isOwner, linearConnected, loadLinearOptions, open, teamId]);

  useEffect(() => {
    if (!open) return;
    setLinearStatus({ type: 'idle' });
  }, [open, teamId]);

  useEffect(() => {
    if (!open || !oauthNotice) return;
    onOAuthNoticeReceived();
    setLinearStatus(resolveOAuthStatus(oauthNotice));

    if (oauthNotice.status === 'success' && teamId && isOwner) {
      void (async () => {
        await refreshTeamSettings();
        await loadLinearOptions(teamId);
      })();
    }
    onOAuthNoticeHandled?.();
  }, [
    isOwner,
    loadLinearOptions,
    oauthNotice,
    onOAuthNoticeHandled,
    onOAuthNoticeReceived,
    open,
    refreshTeamSettings,
    resolveOAuthStatus,
    teamId,
  ]);

  function handleConnectLinear() {
    if (!teamId || typeof window === 'undefined') return;
    const returnTo = `${window.location.pathname}${window.location.search}`;
    const params = new URLSearchParams({ team_id: teamId, return_to: returnTo });
    window.location.assign(`/api/integrations/linear/oauth/start?${params.toString()}`);
  }

  async function handleDisconnectLinear() {
    if (!teamId) return;
    try {
      setDisconnectingLinear(true);
      setLinearStatus({ type: 'loading' });
      await fetchJson(
        `/api/integrations/linear/oauth/connection?team_id=${teamId}`,
        { method: 'DELETE' },
        'Failed to disconnect Linear',
      );
      await refreshTeamSettings();
      setLinearStatus({ type: 'success', message: 'Linear disconnected' });
    } catch (error) {
      setLinearStatus({ type: 'error', message: errorMessage(error) });
    } finally {
      setDisconnectingLinear(false);
    }
  }

  async function handleSaveLinearSettings(event: React.FormEvent) {
    event.preventDefault();
    if (!teamId) return;
    try {
      setSavingLinearSettings(true);
      setLinearStatus({ type: 'loading' });
      await fetchJson(
        `/api/teams/${teamId}/integrations/linear`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            linear_team_id: asNullable(linearTeamId),
            linear_status_mapping: normalizeStatusMapping(linearStatusMapping),
          }),
        },
        'Failed to save Linear settings',
      );
      await refreshTeamSettings();
      await loadLinearOptions(teamId);
      setLinearStatus({ type: 'success', message: 'Linear settings saved' });
    } catch (error) {
      setLinearStatus({ type: 'error', message: errorMessage(error) });
    } finally {
      setSavingLinearSettings(false);
    }
  }

  function setLinearTeamId(value: string) {
    setLinearTeamIdState(value);
    setLinearStatusMapping((current) => {
      if (!value) return current;
      const allowedStateIds = new Set(
        linearStateOptions.filter((state) => state.teamId === value).map((state) => state.id),
      );
      const next: Partial<Record<StoryStatus, string>> = {};
      for (const status of STORY_STATUSES) {
        const mapped = current[status];
        if (mapped && allowedStateIds.has(mapped)) next[status] = mapped;
      }
      return next;
    });
  }

  function setLinearStatusMappingValue(status: StoryStatus, value: string) {
    setLinearStatusMapping((current) => {
      const next = { ...current };
      const normalized = asNullable(value);
      if (normalized) next[status] = normalized;
      else delete next[status];
      return next;
    });
  }

  return {
    linearStatus,
    savingLinearSettings,
    disconnectingLinear,
    linearWorkspaceId,
    linearWorkspaceName,
    linearTeamId,
    setLinearTeamId,
    linearStatusMapping,
    setLinearStatusMappingValue,
    linearConnected,
    linearScope,
    linearExpiresAt,
    linearOptionsLoading,
    linearTeamOptions,
    linearStateOptions,
    handleConnectLinear,
    handleDisconnectLinear,
    handleSaveLinearSettings,
  };
}
