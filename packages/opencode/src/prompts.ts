import type { OpenCodeSessionCreateInput, OpenCodeSessionStoryAssignmentInput } from './types';

/** Build a human-readable session title from the creation input. */
export function buildSessionTitle(input: OpenCodeSessionCreateInput): string {
  if (input.storyTitle && input.linearIssueIdentifier) {
    return `${input.linearIssueIdentifier} ${input.storyTitle}`;
  }
  if (input.storyTitle) {
    return input.storyTitle;
  }
  if (input.runId) {
    return `Build run ${input.runId}`;
  }
  return `Release ${input.releaseId}`;
}

/** Lines constraining the agent to a specific working directory. */
export function workingDirectoryBlock(dir?: string | null): string[] {
  if (!dir) return [];
  return [
    '',
    '## Working Directory',
    `**${dir}**`,
    '',
    'CRITICAL: All file operations MUST happen inside this directory.',
    'Do NOT read, write, or modify files outside this directory.',
    'Do NOT change to a different project directory.',
  ];
}

/** Build the initial system prompt injected when a session is created. */
export function buildSessionContextPrompt(input: OpenCodeSessionCreateInput): string {
  const hasStoryContext = Boolean(input.storyId && input.storyTitle && input.requirements && input.acceptanceCriteria);

  if (hasStoryContext) {
    return [
      '# Story Context',
      `Release ID: ${input.releaseId ?? 'none'}`,
      `Story ID: ${input.storyId}`,
      `Story Title: ${input.storyTitle}`,
      ...(input.linearIssueIdentifier ? [`Linear Issue: ${input.linearIssueIdentifier}`] : []),
      ...workingDirectoryBlock(input.workingDirectory),
      '',
      '## Requirements',
      input.requirements as string,
      '',
      '## Acceptance Criteria',
      input.acceptanceCriteria as string,
      '',
      '## Technical Guidelines',
      input.technicalGuidelines?.trim() || 'None provided.',
    ].join('\n');
  }

  const stories = input.stories ?? [];
  const storyLines =
    stories.length > 0
      ? stories.map(
          (story) =>
            `- ${story.storyTitle} (${story.storyId})${story.linearIssueIdentifier ? ` [${story.linearIssueIdentifier}]` : ''}`,
        )
      : ['- No stories provided'];

  return [
    '# Build Run Context',
    `Release ID: ${input.releaseId ?? 'none'}`,
    `Run ID: ${input.runId ?? 'unknown'}`,
    ...workingDirectoryBlock(input.workingDirectory),
    '',
    '## Assigned Stories',
    ...storyLines,
    '',
    '## Technical Guidelines',
    input.technicalGuidelines?.trim() || 'None provided.',
  ].join('\n');
}

/** Build the prompt injected when a story is assigned to an existing session. */
export function buildStoryAssignmentPrompt(input: OpenCodeSessionStoryAssignmentInput): string {
  return [
    '# Story Assignment',
    `Run ID: ${input.runId}`,
    `Story ID: ${input.storyId}`,
    `Story Title: ${input.storyTitle}`,
    ...(input.linearIssueIdentifier ? [`Linear Issue: ${input.linearIssueIdentifier}`] : []),
    ...workingDirectoryBlock(input.workingDirectory),
    '',
    '## Requirements',
    input.requirements,
    '',
    '## Acceptance Criteria',
    input.acceptanceCriteria,
    '',
    '## Technical Guidelines',
    input.technicalGuidelines?.trim() || 'None provided.',
  ].join('\n');
}

/** Build the "go build" prompt that kicks off implementation after stories are assigned. */
export function buildStartSessionPrompt(storyCount: number, workingDirectory?: string | null): string {
  const noun = storyCount === 1 ? 'story' : 'stories';
  const dirConstraint = workingDirectory
    ? `\nCRITICAL: Your working directory is ${workingDirectory}. ALL file operations must stay inside this directory. Do NOT navigate to or modify any other project.`
    : '';

  return [
    `You have been assigned ${storyCount} ${noun} above.`,
    '',
    'IMPORTANT: Implement them now. Do NOT stop after exploring the codebase.',
    'Do NOT present a plan and wait for confirmation.',
    'Do NOT ask clarifying questions — use your best judgment.',
    dirConstraint,
    '',
    'Your workflow should be:',
    '1. Read the relevant source files to understand the codebase',
    '2. Write the code changes to fulfill the requirements and acceptance criteria',
    '3. Run any existing tests or linters if available',
    '4. Verify your implementation is complete',
    '',
    'Complete the full implementation in this session. Follow any technical guidelines provided in the context above.',
  ].join('\n');
}
