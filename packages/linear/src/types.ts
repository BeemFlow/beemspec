// Re-export generic sync types that Linear consumers will use.
// These are imported via tsconfig path alias from src/integrations/sync/.
// When/if the sync protocol becomes a published package, this re-export layer
// makes the migration transparent to consumers of @beemspec/linear.
export type {
  IssueSnapshot,
  IssueSync,
  IssueUpsertInput,
  StoryForSync,
  StoryPatchFromRemote,
  StoryStatus,
  SyncDirection,
  SyncTarget,
  WebhookEvent,
  WebhookIngest,
  WebhookSignatureVerifier,
} from '@/integrations/sync';

// Linear-specific branded type aliases for clarity at call sites
export type LinearIssueId = string;
export type LinearTeamId = string;
export type LinearProjectId = string;
export type LinearStateId = string;
