import type { LinearIssueGateway, LinearIssueSnapshot, LinearIssueUpsertInput } from './types';

export async function syncStoryToRemote(
  issueSync: LinearIssueGateway | null,
  input: LinearIssueUpsertInput,
  existingIssueId: string | null,
): Promise<LinearIssueSnapshot | null> {
  if (!issueSync) return null;

  if (!existingIssueId) {
    return issueSync.createIssue(input);
  }

  return issueSync.updateIssue(existingIssueId, {
    title: input.title,
    description: input.description,
    projectId: input.projectId,
    stateId: input.stateId,
  });
}
