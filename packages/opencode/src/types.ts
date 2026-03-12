export interface OpenCodeSessionContext {
  releaseId: string;
  releaseName: string | null;
  storyId: string;
  storyTitle: string;
  activityName: string;
  taskName: string;
  requirements: string;
  acceptanceCriteria: string;
  edgeCases: string | null;
  technicalGuidelines: string | null;
  figmaLink: string | null;
}
