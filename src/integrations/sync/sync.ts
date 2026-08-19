import type { IssueSnapshot, IssueSync, IssueUpsertInput } from './types';

/**
 * Sync a story to a remote issue tracker, creating or updating the issue.
 * Provider-agnostic: the caller supplies an IssueSync implementation and
 * a pre-mapped IssueUpsertInput (built by the provider-specific layer).
 */
export async function syncStoryToRemote(
  issueSync: IssueSync | null,
  input: IssueUpsertInput,
  existingIssueId: string | null,
): Promise<IssueSnapshot | null> {
  if (!issueSync) return null;

  if (!existingIssueId) {
    return issueSync.createIssue(input);
  }

  const updateInput: Partial<IssueUpsertInput> = {
    title: input.title,
    description: input.description,
    projectId: input.projectId,
    stateId: input.stateId,
  };
  return issueSync.updateIssue(existingIssueId, updateInput);
}
