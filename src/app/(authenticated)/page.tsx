import { GitBranch, Map as MapIcon } from 'lucide-react';
import { cookies } from 'next/headers';
import { ResourceCollectionSection } from '@/components/dashboard/ResourceCollectionSection';
import { CreateProcessFlowButton } from '@/components/process-flow/CreateProcessFlowButton';
import { CreateStoryMapButton } from '@/components/story-map/CreateStoryMapButton';
import { Card } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/server';
import { listTeamsForUser } from '@/lib/teams';
import { listProcessFlows } from '@/processflow/service';
import { listStoryMaps } from '@/storymap/service';
import type { ProcessFlow, StoryMap } from '@/types';

const TEAM_COOKIE_KEY = 'beemspec_current_team_id';

function resolveCurrentTeamId(teamIds: string[], cookieTeamId: string | null): string | null {
  if (cookieTeamId && teamIds.includes(cookieTeamId)) return cookieTeamId;
  return teamIds[0] ?? null;
}

export default async function Dashboard() {
  const supabase = await createClient();
  const cookieStore = await cookies();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const teamsResult = user ? await listTeamsForUser(supabase, user.id) : { data: [], error: null };
  const teams = teamsResult.data ?? [];
  const currentTeamId = resolveCurrentTeamId(
    teams.map((team) => team.team_id),
    cookieStore.get(TEAM_COOKIE_KEY)?.value ?? null,
  );
  const storyMaps: StoryMap[] = currentTeamId ? ((await listStoryMaps(supabase, currentTeamId)).data ?? []) : [];
  const processFlows: ProcessFlow[] = currentTeamId
    ? ((await listProcessFlows(supabase, currentTeamId)).data ?? [])
    : [];

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
