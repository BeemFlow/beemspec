'use client';

import { CreateNamedResourceButton } from '@/components/dashboard/CreateNamedResourceButton';
import { buildCreateStoryMapPayload } from '@/components/story-map/payloads';

interface CreateStoryMapButtonProps {
  teamId: string | null;
  empty?: boolean;
}

export function CreateStoryMapButton({ teamId, empty = false }: CreateStoryMapButtonProps) {
  return (
    <CreateNamedResourceButton
      teamId={teamId}
      endpoint="/api/story-maps"
      dialogTitle="Create Story Map"
      triggerLabel="New Story Map"
      emptyTriggerLabel="Create your first story map"
      placeholderName="My Product"
      empty={empty}
      buildPayload={buildCreateStoryMapPayload}
    />
  );
}
