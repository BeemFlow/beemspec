import type { IssueSnapshot, IssueSync, IssueUpsertInput } from './types';

export async function syncStoryToRemote(
  issueSync: IssueSync | null,
  input: IssueUpsertInput,
  existingIssueId: string | null,
): Promise<IssueSnapshot | null> {
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
