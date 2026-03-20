'use client';

import { createContent, type StoryContent } from '@beemspec/storymap';
import { useEffect, useState } from 'react';
import { AgentKickoffButton, buildStoryKickoffPrompt } from '@/components/story-map/AgentKickoffButton';
import type { StoryEditSave } from '@/components/story-map/payloads';
import { STATUS_OPTIONS } from '@/components/story-map/story-status';
import { Button } from '@/components/ui/button';
import { DeleteButton } from '@/components/ui/delete-button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { Release, Story, StoryStatus } from '@/types';

interface StoryFormData {
  title: string;
  content: StoryContent;
  status: StoryStatus;
  release_id: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  story: Story | null;
  releases: Release[];
  storyMapId: string;
  storyMapName: string;
  defaultReleaseId?: string | null;
  onSave: (story: StoryEditSave | StoryFormData) => Promise<void> | void;
  onDelete?: () => Promise<void> | void;
}

const NO_RELEASE = '__none__';

export function StoryDialog({
  open,
  onOpenChange,
  story,
  releases,
  storyMapId,
  storyMapName,
  defaultReleaseId,
  onSave,
  onDelete,
}: Props) {
  const [title, setTitle] = useState('');
  const [userStory, setUserStory] = useState('');
  const [acceptanceCriteria, setAcceptanceCriteria] = useState('');
  const [figmaLink, setFigmaLink] = useState('');
  const [edgeCases, setEdgeCases] = useState('');
  const [technicalGuidelines, setTechnicalGuidelines] = useState('');
  const [status, setStatus] = useState<StoryStatus>('backlog');
  const [releaseId, setReleaseId] = useState<string>(NO_RELEASE);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: open is intentionally included to reset form when dialog opens
  useEffect(() => {
    if (story) {
      setTitle(story.title);
      setUserStory(story.content.user_story);
      setAcceptanceCriteria(story.content.acceptance_criteria);
      setFigmaLink(story.content.figma_link || '');
      setEdgeCases(story.content.edge_cases || '');
      setTechnicalGuidelines(story.content.technical_guidelines || '');
      setStatus(story.status);
      setReleaseId(story.release_id || NO_RELEASE);
    } else {
      setTitle('');
      setUserStory('');
      setAcceptanceCriteria('');
      setFigmaLink('');
      setEdgeCases('');
      setTechnicalGuidelines('');
      setStatus('backlog');
      // Default to the release that was clicked, or no release
      setReleaseId(defaultReleaseId || NO_RELEASE);
    }
  }, [story, open, defaultReleaseId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isSubmitting) return;

    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;

    try {
      setIsSubmitting(true);
      await onSave({
        title: trimmedTitle,
        content: createContent({
          user_story: userStory,
          acceptance_criteria: acceptanceCriteria,
          figma_link: figmaLink || null,
          edge_cases: edgeCases || null,
          technical_guidelines: technicalGuidelines || null,
        }),
        status,
        release_id: releaseId === NO_RELEASE ? null : releaseId,
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!onDelete || isSubmitting) return;

    try {
      setIsSubmitting(true);
      await onDelete();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !isSubmitting && onOpenChange(nextOpen)}>
      <DialogContent
        className="max-w-2xl max-h-[90vh] overflow-y-auto"
        onOpenAutoFocus={(e) => story && e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{story ? 'Edit Story' : 'New Story'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="OAuth login with Google"
              disabled={isSubmitting}
              required
              pattern=".*\S.*"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="user-story">User Story * (Who wants what and why?)</Label>
            <Textarea
              id="user-story"
              value={userStory}
              onChange={(e) => setUserStory(e.target.value)}
              placeholder="As a user, I want to sign in with my Google account so that..."
              rows={3}
              disabled={isSubmitting}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="acceptance">Acceptance Criteria * (How do we know it's done?)</Label>
            <Textarea
              id="acceptance"
              value={acceptanceCriteria}
              onChange={(e) => setAcceptanceCriteria(e.target.value)}
              placeholder="- [ ] Google OAuth button on login page&#10;- [ ] Successful auth creates/links user account"
              rows={3}
              disabled={isSubmitting}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="figma">Figma Link</Label>
            <Input
              id="figma"
              value={figmaLink}
              onChange={(e) => setFigmaLink(e.target.value)}
              placeholder="https://figma.com/file/..."
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edge">Edge Cases (What could go wrong?)</Label>
            <Textarea
              id="edge"
              value={edgeCases}
              onChange={(e) => setEdgeCases(e.target.value)}
              placeholder="- User cancels OAuth flow&#10;- Email already exists with password auth"
              rows={2}
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="technical">Technical Guidelines</Label>
            <Textarea
              id="technical"
              value={technicalGuidelines}
              onChange={(e) => setTechnicalGuidelines(e.target.value)}
              placeholder="Use NextAuth.js with Google provider. Follow existing auth patterns..."
              rows={2}
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-4 sm:hidden">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as StoryStatus)} disabled={isSubmitting}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Release</Label>
              <Select value={releaseId} onValueChange={setReleaseId} disabled={isSubmitting}>
                <SelectTrigger>
                  <SelectValue placeholder="No release" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_RELEASE}>No release</SelectItem>
                  {releases.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {story && (
              <AgentKickoffButton
                prompt={buildStoryKickoffPrompt({ storyMapId, storyMapName, story })}
                label="Copy Agent Prompt"
                tooltip="Copy agent kickoff prompt for this story"
                variant="ghost"
                size="default"
              />
            )}
          </div>

          <div className="hidden sm:grid sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:grid-rows-[auto_auto] sm:items-start sm:gap-x-4 sm:gap-y-2">
            <Label className="sm:col-start-1 sm:row-start-1">Status</Label>
            <Label className="sm:col-start-2 sm:row-start-1">Release</Label>
            {story && <div className="sm:col-start-3 sm:row-start-1" aria-hidden="true" />}

            <div className="sm:col-start-1 sm:row-start-2">
              <Select value={status} onValueChange={(v) => setStatus(v as StoryStatus)} disabled={isSubmitting}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="min-w-0 sm:col-start-2 sm:row-start-2">
              <Select value={releaseId} onValueChange={setReleaseId} disabled={isSubmitting}>
                <SelectTrigger className="w-full min-w-0">
                  <SelectValue placeholder="No release" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_RELEASE}>No release</SelectItem>
                  {releases.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {story && (
              <div className="shrink-0 sm:col-start-3 sm:row-start-2 sm:self-start">
                <AgentKickoffButton
                  prompt={buildStoryKickoffPrompt({ storyMapId, storyMapName, story })}
                  label="Copy Agent Prompt"
                  tooltip="Copy agent kickoff prompt for this story"
                  variant="ghost"
                  size="default"
                />
              </div>
            )}
          </div>

          <div className="flex items-end justify-between pt-4">
            <div className="flex items-center gap-2">
              {onDelete && (
                <DeleteButton
                  onDelete={handleDelete}
                  confirmTitle="Delete story?"
                  confirmDescription="This story will be permanently deleted."
                  loading={isSubmitting}
                />
              )}
            </div>
            <div className="ml-auto flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Saving Story...' : 'Save Story'}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
