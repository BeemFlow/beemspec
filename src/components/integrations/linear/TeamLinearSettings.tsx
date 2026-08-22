'use client';

import { Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { IntegrationSection } from '@/components/ui/integration-section';
import { Label } from '@/components/ui/label';
import { nonCredentialFieldProps, nonCredentialFormProps } from '@/components/ui/non-credential-fields';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { StoryStatus } from '@/domain/story-map';
import type { LinearStatus } from './use-team-linear-settings';

export interface TeamLinearSettingsProps {
  isOwner: boolean;
  linearConnected: boolean;
  linearScope: string | null;
  linearExpiresAt: string | null;
  linearWorkspaceId: string;
  linearWorkspaceName: string;
  linearTeamId: string;
  linearOptionsLoading: boolean;
  linearTeamOptions: Array<{ id: string; name: string; key: string | null }>;
  linearStateOptions: Array<{ id: string; name: string; type: string | null; teamId: string }>;
  linearStatusMapping: Partial<Record<StoryStatus, string>>;
  savingLinearSettings: boolean;
  disconnectingLinear: boolean;
  linearStatus: LinearStatus;
  onConnectLinear: () => void;
  onDisconnectLinear: () => Promise<void>;
  onSaveLinearSettings: (event: React.FormEvent) => Promise<void>;
  onLinearTeamChange: (value: string) => void;
  onLinearStatusMappingChange: (status: StoryStatus, value: string) => void;
}

const LINEAR_OAUTH_REASON_TO_MESSAGE: Record<string, string> = {
  missing_state: 'Linear OAuth failed: missing state.',
  invalid_state: 'Linear OAuth failed: invalid state.',
  not_owner: 'Only team owners can connect Linear.',
  authorization_denied: 'Linear OAuth was cancelled or denied.',
  token_exchange_failed: 'Linear OAuth failed while exchanging the code.',
};

export function linearOAuthNoticeToStatus(input: { status: 'success' | 'error'; reason?: string }): LinearStatus {
  if (input.status === 'success') {
    return { type: 'success', message: 'Linear OAuth connection updated.' };
  }

  const mappedReason = input.reason ? LINEAR_OAUTH_REASON_TO_MESSAGE[input.reason] : null;
  return { type: 'error', message: mappedReason ?? 'Linear OAuth failed.' };
}

function LinearConnectionSummary(input: { connected: boolean; scope: string | null; expiresAt: string | null }) {
  return (
    <div className="rounded-md border px-3 py-2 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground">Connection</span>
        <Badge variant={input.connected ? 'default' : 'secondary'}>
          {input.connected ? 'connected' : 'not connected'}
        </Badge>
      </div>
      {input.connected && (
        <p className="mt-2 text-xs text-muted-foreground">Ready to configure workspace defaults and status mapping.</p>
      )}
      {input.scope && <p className="mt-2 text-xs text-muted-foreground">Scopes: {input.scope}</p>}
      {input.expiresAt && <p className="mt-1 text-xs text-muted-foreground">Expires: {input.expiresAt}</p>}
    </div>
  );
}

function LinearConnectionActions(input: {
  isOwner: boolean;
  connected: boolean;
  disconnecting: boolean;
  onConnect: () => void;
  onDisconnect: () => Promise<void>;
}) {
  if (!input.isOwner) {
    return <p className="text-sm text-muted-foreground">Only team owners can manage Linear OAuth connection.</p>;
  }

  return (
    <div className="flex items-center gap-2">
      {!input.connected ? (
        <Button type="button" variant="outline" onClick={input.onConnect}>
          Connect Linear
        </Button>
      ) : (
        <Button type="button" variant="outline" onClick={input.onDisconnect} disabled={input.disconnecting}>
          {input.disconnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Disconnect Linear'}
        </Button>
      )}
    </div>
  );
}

export function LinearSettingsForm(input: {
  isOwner: boolean;
  workspaceName: string;
  teamId: string;
  optionsLoading: boolean;
  teamOptions: Array<{ id: string; name: string; key: string | null }>;
  stateOptions: Array<{ id: string; name: string; type: string | null; teamId: string }>;
  statusMapping: Partial<Record<StoryStatus, string>>;
  saving: boolean;
  onSave: (event: React.FormEvent) => Promise<void>;
  onTeamChange: (value: string) => void;
  onStatusMappingChange: (status: StoryStatus, value: string) => void;
}) {
  const NO_SELECTION = '__none__';
  const filteredStateOptions = input.stateOptions.filter((state) =>
    input.teamId ? state.teamId === input.teamId : true,
  );
  const statusRows: Array<{ key: StoryStatus; label: string }> = [
    { key: 'backlog', label: 'Backlog' },
    { key: 'todo', label: 'Todo' },
    { key: 'in_progress', label: 'In Progress' },
    { key: 'in_review', label: 'In Review' },
    { key: 'done', label: 'Done' },
  ];

  const selectedTeam = input.teamOptions.find((team) => team.id === input.teamId);

  return (
    <form {...nonCredentialFormProps} onSubmit={input.onSave} className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="linear-workspace-name">Linear workspace</Label>
        <Input
          id="linear-workspace-name"
          value={input.workspaceName}
          disabled
          readOnly
          placeholder="Not connected"
          {...nonCredentialFieldProps}
        />
      </div>
      <div className="space-y-2">
        <Label>Linear team</Label>
        <Select
          value={input.teamId || NO_SELECTION}
          onValueChange={(value) => input.onTeamChange(value === NO_SELECTION ? '' : value)}
          disabled={!input.isOwner || input.saving || input.optionsLoading || input.teamOptions.length === 0}
        >
          <SelectTrigger id="linear-team-name" className="w-full">
            <SelectValue placeholder={input.optionsLoading ? 'Loading teams...' : 'No team selected'} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_SELECTION}>No team selected</SelectItem>
            {input.teamOptions.map((team) => (
              <SelectItem key={team.id} value={team.id}>
                {team.name}
                {team.key ? ` (${team.key})` : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!input.optionsLoading && selectedTeam && (
          <p className="text-xs text-muted-foreground">
            Selected: {selectedTeam.name}
            {selectedTeam.key ? ` (${selectedTeam.key})` : ''}
          </p>
        )}
      </div>
      <div className="space-y-2">
        <Label>Status mapping</Label>
        <div className="space-y-2 rounded-md border bg-muted/20 p-3">
          {statusRows.map((row) => (
            <div key={row.key} className="grid grid-cols-[120px_1fr] items-center gap-2">
              <span className="text-xs text-muted-foreground">{row.label}</span>
              <Select
                value={input.statusMapping[row.key] ?? NO_SELECTION}
                onValueChange={(value) => input.onStatusMappingChange(row.key, value === NO_SELECTION ? '' : value)}
                disabled={!input.isOwner || input.saving || input.optionsLoading || !input.teamId}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={`Map ${row.label}`} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_SELECTION}>Unmapped</SelectItem>
                  {filteredStateOptions.map((state) => (
                    <SelectItem key={state.id} value={state.id}>
                      {state.name}
                      {state.type ? ` (${state.type})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      </div>
      {input.isOwner && (
        <Button type="submit" disabled={input.saving || !input.teamId.trim()}>
          {input.saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
        </Button>
      )}
    </form>
  );
}

export function TeamLinearSettings({
  isOwner,
  linearConnected,
  linearScope,
  linearExpiresAt,
  linearWorkspaceId,
  linearWorkspaceName,
  linearTeamId,
  linearOptionsLoading,
  linearTeamOptions,
  linearStateOptions,
  linearStatusMapping,
  savingLinearSettings,
  disconnectingLinear,
  linearStatus,
  onConnectLinear,
  onDisconnectLinear,
  onSaveLinearSettings,
  onLinearTeamChange,
  onLinearStatusMappingChange,
}: TeamLinearSettingsProps) {
  return (
    <div className="space-y-6">
      <IntegrationSection title="Linear" description="Connect Linear and configure team-wide defaults.">
        <LinearConnectionSummary connected={linearConnected} scope={linearScope} expiresAt={linearExpiresAt} />

        <LinearConnectionActions
          isOwner={isOwner}
          connected={linearConnected}
          disconnecting={disconnectingLinear}
          onConnect={onConnectLinear}
          onDisconnect={onDisconnectLinear}
        />

        {linearConnected ? (
          <LinearSettingsForm
            isOwner={isOwner}
            workspaceName={linearWorkspaceName || linearWorkspaceId}
            teamId={linearTeamId}
            optionsLoading={linearOptionsLoading}
            teamOptions={linearTeamOptions}
            stateOptions={linearStateOptions}
            statusMapping={linearStatusMapping}
            saving={savingLinearSettings}
            onSave={onSaveLinearSettings}
            onTeamChange={onLinearTeamChange}
            onStatusMappingChange={onLinearStatusMappingChange}
          />
        ) : null}

        {linearStatus.type === 'success' && <p className="text-sm text-success">{linearStatus.message}</p>}
        {linearStatus.type === 'error' && <p className="text-sm text-destructive">{linearStatus.message}</p>}
      </IntegrationSection>
    </div>
  );
}
