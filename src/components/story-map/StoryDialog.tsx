'use client'

import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Story, Release, StoryStatus } from '@/types'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  story: Story | null
  releases: Release[]
  defaultReleaseId?: string | null
  onSave: (story: Partial<Story>) => void
  onDelete?: () => void
}

const STATUSES: { value: StoryStatus; label: string }[] = [
  { value: 'backlog', label: 'Backlog' },
  { value: 'ready', label: 'Ready' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'review', label: 'Review' },
  { value: 'done', label: 'Done' },
]

const NO_RELEASE = '__none__'

export function StoryDialog({ open, onOpenChange, story, releases, defaultReleaseId, onSave, onDelete }: Props) {
  const [title, setTitle] = useState('')
  const [requirements, setRequirements] = useState('')
  const [acceptanceCriteria, setAcceptanceCriteria] = useState('')
  const [figmaLink, setFigmaLink] = useState('')
  const [edgeCases, setEdgeCases] = useState('')
  const [technicalGuidelines, setTechnicalGuidelines] = useState('')
  const [status, setStatus] = useState<StoryStatus>('backlog')
  const [releaseId, setReleaseId] = useState<string>(NO_RELEASE)

  useEffect(() => {
    if (story) {
      setTitle(story.title)
      setRequirements(story.requirements)
      setAcceptanceCriteria(story.acceptance_criteria)
      setFigmaLink(story.figma_link || '')
      setEdgeCases(story.edge_cases || '')
      setTechnicalGuidelines(story.technical_guidelines || '')
      setStatus(story.status)
      setReleaseId(story.release_id || NO_RELEASE)
    } else {
      setTitle('')
      setRequirements('')
      setAcceptanceCriteria('')
      setFigmaLink('')
      setEdgeCases('')
      setTechnicalGuidelines('')
      setStatus('backlog')
      // Default to the release that was clicked, or no release
      setReleaseId(defaultReleaseId || NO_RELEASE)
    }
  }, [story, open, defaultReleaseId])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onSave({
      title,
      requirements,
      acceptance_criteria: acceptanceCriteria,
      figma_link: figmaLink || null,
      edge_cases: edgeCases || null,
      technical_guidelines: technicalGuidelines || null,
      status,
      release_id: releaseId === NO_RELEASE ? null : releaseId,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
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
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="requirements">Requirements * (What should be built?)</Label>
            <Textarea
              id="requirements"
              value={requirements}
              onChange={(e) => setRequirements(e.target.value)}
              placeholder="As a user, I want to sign in with my Google account so that..."
              rows={3}
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
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as StoryStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Release</Label>
              <Select value={releaseId} onValueChange={setReleaseId}>
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
          </div>

          <div className="flex justify-between pt-4">
            {onDelete && (
              <Button type="button" variant="destructive" onClick={onDelete}>
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </Button>
            )}
            <div className="ml-auto flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit">Save Story</Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
