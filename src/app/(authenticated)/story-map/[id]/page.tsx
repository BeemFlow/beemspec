import { notFound } from 'next/navigation';
import { StoryMap } from '@/components/story-map/StoryMap';
import { DbErrorCode } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { getStoryMapGraph } from '@/storymap/service';
import type { StoryMapFull } from '@/types';

export default async function StoryMapPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

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
