type StoryLike = {
  id: string;
  title: string;
  status: string;
  release_id: string | null;
  content?: {
    user_story?: string;
    acceptance_criteria?: string;
    edge_cases?: string | null;
    figma_link?: string | null;
  } | null;
};

type StoryPlanningRef = {
  id: string;
  title: string;
  status: string;
  release_id: string | null;
  has_figma_link: boolean;
  has_edge_cases: boolean;
};

type TaskLike = {
  id: string;
  name: string;
  stories?: StoryPlanningRef[];
  description?: string | null;
  sort_order?: number;
};

type ActivityLike = {
  id: string;
  name: string;
  description?: string | null;
  sort_order?: number;
  tasks?: TaskLike[];
};

type ReleaseLike = {
  id: string;
  name: string;
  description?: string | null;
  context_markdown?: string | null;
  sort_order?: number;
};

type PersonaLike = {
  id: string;
  name: string;
  goals?: string | null;
};

export function toStoryPlanningRef(story: StoryLike): StoryPlanningRef {
  return {
    id: story.id,
    title: story.title,
    status: story.status,
    release_id: story.release_id,
    has_figma_link: Boolean(story.content?.figma_link),
    has_edge_cases: Boolean(story.content?.edge_cases),
  };
}

export function buildPlanningLanes(releases: ReleaseLike[]) {
  return [
    { releaseId: null, releaseName: 'Backlog' },
    ...releases.map((release) => ({
      releaseId: release.id,
      releaseName: release.name,
    })),
  ];
}

export function filterActivitiesForRelease(
  activities: Array<ActivityLike & { tasks?: Array<TaskLike & { stories?: StoryPlanningRef[] }> }>,
  releaseId: string,
) {
  return activities
    .map((activity) => ({
      ...activity,
      tasks: (activity.tasks ?? [])
        .map((task) => ({
          ...task,
          stories: (task.stories ?? []).filter((story) => story.release_id === releaseId),
        }))
        .filter((task) => (task.stories?.length ?? 0) > 0),
    }))
    .filter((activity) => (activity.tasks?.length ?? 0) > 0);
}

export function buildStoryMapInsights(input: {
  map: { id: string; name: string; description?: string | null; context_markdown?: string | null };
  activities: ActivityLike[];
  releases: ReleaseLike[];
  personas: PersonaLike[];
}) {
  const allTasks = input.activities.flatMap((activity) => activity.tasks ?? []);
  const allStories = allTasks.flatMap((task) => task.stories ?? []);
  const backlogStories = allStories.filter((story) => story.release_id === null);
  const storiesWithFigma = allStories.filter((story) => story.has_figma_link);
  const storiesMissingEdgeCases = allStories.filter((story) => !story.has_edge_cases);
  const implementationNamedActivities = input.activities.filter((activity) =>
    /frontend|backend|api|database|infra|platform|ui/i.test(activity.name),
  );
  const implementationNamedTasks = allTasks.filter((task) =>
    /frontend|backend|api|database|schema|endpoint|ui/i.test(task.name),
  );
  const implementationHeavyStories = allStories.filter((story) =>
    /build|create|add|implement|refactor|wire|setup/i.test(story.title),
  );

  const statusCounts = allStories.reduce<Record<string, number>>((acc, story) => {
    acc[story.status] = (acc[story.status] ?? 0) + 1;
    return acc;
  }, {});

  const releaseSummaries = [
    {
      releaseId: null,
      releaseName: 'Backlog',
      storyCount: backlogStories.length,
      unfinishedCount: backlogStories.filter((story) => story.status !== 'done').length,
      storiesWithFigmaCount: backlogStories.filter((story) => story.has_figma_link).length,
    },
    ...input.releases.map((release) => {
      const stories = allStories.filter((story) => story.release_id === release.id);
      return {
        releaseId: release.id,
        releaseName: release.name,
        storyCount: stories.length,
        unfinishedCount: stories.filter((story) => story.status !== 'done').length,
        storiesWithFigmaCount: stories.filter((story) => story.has_figma_link).length,
        hasContext: Boolean(release.context_markdown),
      };
    }),
  ];

  const storyMappingWarnings: string[] = [];
  if (input.activities.length === 0)
    storyMappingWarnings.push('This map has no activities yet, so the user workflow backbone is not defined.');
  if (allTasks.length === 0)
    storyMappingWarnings.push('This map has no tasks yet, so activities are not broken into user tasks.');
  if (input.releases.length === 0)
    storyMappingWarnings.push(
      'This map has no named releases yet. Keep backlog-only planning if delivery slicing is still premature, but add releases once the team needs a concrete usable increment plan.',
    );
  if (input.releases.length > 0 && allStories.length > 0 && allStories.every((story) => story.release_id === null)) {
    storyMappingWarnings.push(
      'All stories are still in backlog even though releases exist. The release plan may be underspecified.',
    );
  }
  if (!input.map.context_markdown) {
    storyMappingWarnings.push(
      'This map has no context markdown yet, so product-level goals and guardrails are not captured in BeemSpec.',
    );
  }
  if (implementationNamedActivities.length > 0 || implementationNamedTasks.length > 0) {
    storyMappingWarnings.push(
      'Some activity or task names look implementation-oriented rather than user-workflow-oriented.',
    );
  }

  const recommendedNextActions: string[] = [];
  if (input.activities.length === 0) {
    recommendedNextActions.push('Create workflow-first activities before adding more delivery detail.');
  }
  if (allTasks.length > 0 && allStories.length === 0) {
    recommendedNextActions.push('Add thin end-to-end stories under the existing tasks so the map becomes actionable.');
  }
  if (input.releases.length > 0) {
    recommendedNextActions.push(
      'Choose a target release, then call release_get or inspect unfinished stories in that lane before implementation.',
    );
  } else {
    recommendedNextActions.push(
      'Keep stories in backlog until you have enough clarity to define a usable release slice.',
    );
  }
  if (storiesWithFigma.length > 0) {
    recommendedNextActions.push(
      'For stories with Figma links, fetch design context through the Figma MCP server before UI implementation.',
    );
  }
  if (input.personas.length > 0) {
    recommendedNextActions.push(
      'Use persona goals to refine acceptance criteria and release choice when they materially affect the workflow.',
    );
  }

  const topRiskFlags: string[] = [];
  if (implementationNamedActivities.length > 0 || implementationNamedTasks.length > 0) {
    topRiskFlags.push('Map structure may reflect implementation breakdown instead of user workflow.');
  }
  if (implementationHeavyStories.length > 0) {
    topRiskFlags.push('Some story titles may describe implementation tasks rather than user-visible outcomes.');
  }
  if (storiesMissingEdgeCases.length > 0) {
    topRiskFlags.push('Some stories omit edge cases, which may hide implementation risk.');
  }
  if (input.releases.some((release) => !release.context_markdown)) {
    topRiskFlags.push(
      'One or more releases lack context markdown, which may weaken release-level scope and priority decisions.',
    );
  }

  return {
    map_summary: {
      storyMapId: input.map.id,
      storyMapName: input.map.name,
      activityCount: input.activities.length,
      taskCount: allTasks.length,
      releaseCount: input.releases.length,
      personaCount: input.personas.length,
      storyCount: allStories.length,
      backlogStoryCount: backlogStories.length,
      storiesWithFigmaCount: storiesWithFigma.length,
      storiesMissingEdgeCasesCount: storiesMissingEdgeCases.length,
      statusCounts,
    },
    release_summaries: releaseSummaries,
    persona_summary: input.personas.map((persona) => ({
      personaId: persona.id,
      name: persona.name,
      goals: persona.goals ?? null,
    })),
    top_risk_flags: topRiskFlags.slice(0, 3),
    story_mapping_warnings: storyMappingWarnings,
    recommended_next_actions: recommendedNextActions.slice(0, 3),
  };
}

export function buildMutationGuidance(input: {
  entityType: 'story' | 'task' | 'activity' | 'release' | 'storymap';
  operation: 'create' | 'update' | 'move' | 'reorder';
  ids?: Record<string, string | null | undefined>;
  entity?: Record<string, unknown> | null;
}) {
  const nextRecommendedReads: string[] = [];
  const verificationHints: string[] = [];
  const warnings: string[] = [];

  if (input.entityType === 'story') {
    if (input.operation === 'create' && input.ids?.story_id)
      nextRecommendedReads.push(
        'Call story_context_get(story_id) only if this story is the next one you plan to implement or refine deeply.',
      );
    if (input.operation === 'move' || input.operation === 'reorder') {
      nextRecommendedReads.push(
        'Call storymap_get(story_map_id) after the current structural mutation batch to verify release coherence and ordering.',
      );
    }
    verificationHints.push(
      'Confirm the story still reads as a thin user-visible slice with testable acceptance criteria.',
    );
    verificationHints.push(
      'Confirm the story is in the correct task and release cell, including backlog vs named release.',
    );

    const content = typeof input.entity?.content === 'object' && input.entity?.content ? input.entity.content : null;
    const figmaLink = content && 'figma_link' in content ? Reflect.get(content, 'figma_link') : null;
    const edgeCases = content && 'edge_cases' in content ? Reflect.get(content, 'edge_cases') : null;

    if (!edgeCases) {
      warnings.push('No edge cases are captured for this story yet; add them if failure modes matter.');
    }
    if (typeof figmaLink === 'string' && figmaLink.length > 0) {
      verificationHints.push(
        'A Figma link is present. If Figma MCP is connected, fetch design context before UI implementation.',
      );
    }
  }

  if (input.entityType === 'task' || input.entityType === 'activity') {
    if (input.operation === 'create' || input.operation === 'move' || input.operation === 'reorder') {
      nextRecommendedReads.push(
        'Call storymap_get(story_map_id) after the current structural mutation batch to verify workflow order left-to-right.',
      );
    }
    verificationHints.push(
      'Confirm names describe user workflow steps rather than internal components or team ownership.',
    );
  }

  if (input.entityType === 'release') {
    if (input.operation === 'create' || input.operation === 'reorder') {
      nextRecommendedReads.push(
        'Call storymap_get(story_map_id) after the current structural mutation batch to verify release ordering and story placement.',
      );
    }
    verificationHints.push(
      'Confirm the release still represents a usable increment rather than an internal implementation phase.',
    );
  }

  if (input.operation === 'move' || input.operation === 'reorder') {
    verificationHints.push('Verify ordering in the destination lane after this structural change.');
  }

  return {
    next_recommended_reads: nextRecommendedReads,
    verification_hints: verificationHints,
    warnings,
  };
}
