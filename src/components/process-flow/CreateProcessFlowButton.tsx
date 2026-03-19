'use client';

import { CreateNamedResourceButton } from '@/components/dashboard/CreateNamedResourceButton';

interface CreateProcessFlowButtonProps {
  teamId: string | null;
  empty?: boolean;
}

function buildCreateProcessFlowPayload(teamId: string, name: string, description: string) {
  return {
    team_id: teamId,
    name,
    description: description.trim() ? description : null,
  };
}

export function CreateProcessFlowButton({ teamId, empty = false }: CreateProcessFlowButtonProps) {
  return (
    <CreateNamedResourceButton
      teamId={teamId}
      endpoint="/api/process-flows"
      dialogTitle="Create Process Flow"
      triggerLabel="New Process Flow"
      emptyTriggerLabel="Create your first process flow"
      placeholderName="Accounts Payable"
      empty={empty}
      buildPayload={buildCreateProcessFlowPayload}
    />
  );
}
