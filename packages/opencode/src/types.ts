export interface OpenCodeSessionContext {
  releaseId: string;
  storyId: string;
  storyTitle: string;
  requirements: string;
  acceptanceCriteria: string;
  technicalGuidelines: string | null;
}
