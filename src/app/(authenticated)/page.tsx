import { Map as MapIcon } from 'lucide-react';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { CreateStoryMapButton } from '@/components/story-map/CreateStoryMapButton';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { createClient } from '@/lib/supabase/server';
import { listTeamsForUser } from '@/lib/teams';
import { listStoryMaps } from '@/storymap/service';
import type { StoryMap } from '@/types';

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

  const showEmpty = Boolean(currentTeamId) && storyMaps.length === 0;
  const showGrid = Boolean(currentTeamId) && storyMaps.length > 0;
  const showNoTeamState = !currentTeamId;

  return (
    <div className="p-8">
      <div className="mx-auto max-w-[912px]">
        <div className="mb-8 flex items-center justify-between gap-6">
          <h1 className="text-3xl font-bold">Story Maps</h1>
          <CreateStoryMapButton teamId={currentTeamId} />
        </div>

        {showNoTeamState ? (
          <Card className="border-dashed p-8 text-center">
            <h3 className="font-medium">Create or select a team to get started</h3>
            <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
              Use the team menu in the top right to create your first workspace before making story maps.
            </p>
          </Card>
        ) : showEmpty ? (
          <Card className="border-dashed p-8 text-center">
            <MapIcon className="mx-auto h-12 w-12 text-muted-foreground/50" />
            <h3 className="mt-4 font-medium">No story maps yet</h3>
            <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
              Story maps help you plan your product from the user&apos;s perspective. Start by mapping out the user
              journey.
            </p>
            <CreateStoryMapButton teamId={currentTeamId} empty />
          </Card>
        ) : showGrid ? (
          <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,280px))] justify-center gap-6">
            {storyMaps.map((map) => (
              <Link key={map.id} href={`/story-map/${map.id}`} className="block w-[280px] max-w-full">
                <Card className="h-full min-h-[192px] w-full transition-colors hover:bg-muted/50">
                  <CardHeader className="h-full content-start">
                    <CardTitle className="line-clamp-2 text-xl leading-tight">{map.name}</CardTitle>
                    {map.description && (
                      <CardDescription className="line-clamp-4 text-sm">{map.description}</CardDescription>
                    )}
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
