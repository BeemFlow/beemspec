// Linear provider adapter
// Description formatting, status mapping, SDK client, webhook parsing,
// and request validation for story map <-> Linear issue sync.

export type {
  LinearClientOptions,
  LinearProjectIssueImportOption,
  LinearProjectOption,
  LinearStateOption,
  LinearTeamOption,
  LinearViewerInfo,
  LinearWorkspaceOptions,
} from './client';
// Client (SDK wrapper with retry/backoff)
export {
  createLinearClient,
  getLinearViewerInfo,
  getLinearWorkspaceOptions,
  listLinearProjectIssuesForImport,
  resolveLinearStateIdForStoryStatus,
  selectLinearStateIdForStoryStatus,
} from './client';
export type { ManualLinearSyncResponse, StoryMapLinearSettingsResponse } from './contracts';
export { manualLinearSyncResponseSchema, storyMapLinearSettingsResponseSchema } from './contracts';
export type { ParsedLinearStoryFields } from './description';
// Description serialize/parse
export { buildLinearDescription, mapStoryToLinearIssueInput, parseLinearDescriptionToStoryFields } from './description';
export type { LinearIssueForSync } from './patch';
// Patch building (Linear description -> local story patch)
export { buildStoryPatchFromLinearIssue } from './patch';
export type {
  UpdateLinearIntegrationSettings,
  UpdateStoryMapLinearSettings,
} from './schemas';
// Zod validation schemas
export {
  updateLinearIntegrationSettingsSchema,
  updateStoryMapLinearSettingsSchema,
} from './schemas';

// Status mapping
export { mapLinearStateToStoryStatus, mapLinearStatusToStoryStatus } from './status-map';
export { syncStoryToRemote } from './sync';
export type {
  LinearIssueGateway,
  LinearIssueSnapshot,
  LinearIssueUpsertInput,
  LinearStoryPatch,
  LinearSyncTarget,
  LinearWebhookEvent,
  LinearWebhookIngest,
  LinearWebhookSignatureVerifier,
} from './types';
// Webhook parsing + signature verification
export {
  createLinearWebhookIngest,
  createLinearWebhookSignatureVerifier,
  parseLinearWebhookEvent,
} from './webhook';
