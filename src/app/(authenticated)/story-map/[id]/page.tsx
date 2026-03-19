import { notFound } from 'next/navigation';
import { StoryMap } from '@/components/story-map/StoryMap';
import { getE2EStoryMap } from '@/lib/e2e/processflow-store';
import { env } from '@/lib/env';
import { DbErrorCode } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { getStoryMapGraph } from '@/storymap/service';
import type { StoryMapFull } from '@/types';

export default async function StoryMapPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (env.e2eTestMode()) {
    const storyMap = getE2EStoryMap(id);
    if (!storyMap) notFound();
    return <StoryMap initialStoryMap={storyMap} />;
  }

  const supabase = await createClient();
  const { mapResult, activitiesResult, releasesResult, personasResult } = await getStoryMapGraph(supabase, id, {
    includePersonas: true,
  });

  if (mapResult.error) {
    if (mapResult.error.code === DbErrorCode.NOT_FOUND) {
      notFound();
    }
    throw mapResult.error;
  }

  if (activitiesResult.error) throw activitiesResult.error;
  if (releasesResult.error) throw releasesResult.error;
  if (personasResult.error) throw personasResult.error;

  const storyMap: StoryMapFull = {
    ...mapResult.data,
    activities: activitiesResult.data,
    releases: releasesResult.data,
    personas: personasResult.data,
  };

  return <StoryMap initialStoryMap={storyMap} />;
}
