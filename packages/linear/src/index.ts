// @beemspec/linear -- Linear sync adapter
// Description formatting, status mapping, SDK client, webhook parsing,
// and request validation for story map <-> Linear issue sync.

export type {
  LinearClientOptions,
  LinearProjectOption,
  LinearStateOption,
  LinearTeamOption,
  LinearViewerInfo,
  LinearWorkspaceOptions,
} from './client';
// Client (SDK wrapper with retry/backoff)
export { createLinearClient, getLinearViewerInfo, getLinearWorkspaceOptions } from './client';
export type { ParsedLinearStoryFields } from './description';
// Description serialize/parse
export { buildLinearDescription, mapStoryToLinearIssueInput, parseLinearDescriptionToStoryFields } from './description';
export type { LinearIssueForSync } from './patch';
// Patch building (Linear description -> generic StoryPatchFromRemote)
export { buildStoryPatchFromLinearIssue } from './patch';
export type {
  LinearSyncBatchRequest,
  LinearSyncStoryRequest,
  UpdateLinearIntegrationSettings,
  UpdateStoryMapLinearSettings,
} from './schemas';
// Zod validation schemas
export {
  linearSyncBatchSchema,
  linearSyncStorySchema,
  updateLinearIntegrationSettingsSchema,
  updateStoryMapLinearSettingsSchema,
} from './schemas';

// Status mapping
export { mapLinearStatusToStoryStatus } from './status-map';

// Type aliases
export type { LinearIssueId, LinearProjectId, LinearStateId, LinearTeamId } from './types';

// Webhook parsing + signature verification
export {
  createLinearWebhookIngest,
  createLinearWebhookSignatureVerifier,
  parseLinearWebhookEvent,
} from './webhook';
