import { GitBranch, Map as MapIcon } from 'lucide-react';
import { ResourceCollectionSection } from '@/components/dashboard/ResourceCollectionSection';
import { CreateProcessFlowButton } from '@/components/process-flow/CreateProcessFlowButton';
import { CreateStoryMapButton } from '@/components/story-map/CreateStoryMapButton';
import { Card } from '@/components/ui/card';
import { getAppContext } from '@/lib/app-context';
import { listProcessFlows } from '@/processflow/service';
import { listStoryMaps } from '@/storymap/service';
import type { ProcessFlow, StoryMap } from '@/types';

export default async function Dashboard() {
  const { supabase, currentTeamId } = await getAppContext();
  const [storyMapsResult, processFlowsResult] = currentTeamId
    ? await Promise.all([listStoryMaps(supabase, currentTeamId), listProcessFlows(supabase, currentTeamId)])
    : [{ data: [] }, { data: [] }];
  const storyMaps: StoryMap[] = storyMapsResult.data ?? [];
  const processFlows: ProcessFlow[] = processFlowsResult.data ?? [];

  const showNoTeamState = !currentTeamId;

  return (
    <div className="p-8">
      <div className="mx-auto max-w-[1120px] space-y-14">
        {showNoTeamState ? (
          <Card className="border-dashed p-8 text-center">
            <h3 className="font-medium">Create or select a team to get started</h3>
            <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
              Use the team menu in the top right to create your first workspace before making story maps or process
              flows.
            </p>
          </Card>
        ) : null}

        {!showNoTeamState ? (
          <>
            <ResourceCollectionSection
              title="Story Maps"
              createButton={<CreateStoryMapButton teamId={currentTeamId} />}
              items={storyMaps}
              hrefBase="/story-map"
              emptyTitle="No story maps yet"
              emptyDescription="Story maps help you plan your product from the user's perspective. Start by mapping out the user journey."
              emptyCreateButton={<CreateStoryMapButton teamId={currentTeamId} empty />}
              icon={MapIcon}
            />

            <ResourceCollectionSection
              title="Process Flows"
              createButton={<CreateProcessFlowButton teamId={currentTeamId} />}
              items={processFlows}
              hrefBase="/process-flows"
              emptyTitle="No process flows yet"
              emptyDescription="Process flows help you map operational reality, document handoffs, and identify automation opportunities before implementation work starts."
              emptyCreateButton={<CreateProcessFlowButton teamId={currentTeamId} empty />}
              icon={GitBranch}
            />
          </>
        ) : null}
      </div>
    </div>
  );
}
