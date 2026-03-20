'use client';

import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';

const STORY_MAP_PLACEHOLDER = `Use this space to capture durable product context that applies across the entire story map.

Examples:
- Product purpose and target users
- Quarterly or strategic goals
- Key business metrics and success criteria
- Prioritization philosophy and guardrails
- Non-goals and things explicitly out of scope`;

const RELEASE_PLACEHOLDER = `Use this space to capture context specific to this release.

Examples:
- What this release is trying to accomplish
- Business objectives and success criteria
- What should be prioritized or deprioritized
- Technical constraints or guidance
- Rollout and verification notes`;

const PROCESS_FLOW_PLACEHOLDER = `Use this space to capture durable operational context for this process flow.

Examples:
- Business purpose and scope of the workflow
- Teams, roles, or systems involved
- Operational constraints and service-level expectations
- Pain points, risks, and bottlenecks observed in discovery
- Notes that should guide redesign and automation decisions`;

interface ContextMarkdownDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  value: string | null;
  onSave: (value: string | null) => Promise<void>;
  variant: 'story-map' | 'release' | 'process-flow';
}

export function ContextMarkdownDialog({
  open,
  onOpenChange,
  title,
  value,
  onSave,
  variant,
}: ContextMarkdownDialogProps) {
  const [draft, setDraft] = useState(value ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setDraft(value ?? '');
      setError(null);
    }
  }, [open, value]);

  const hasChanges = (draft.trim() || null) !== (value || null);
  const placeholder =
    variant === 'story-map'
      ? STORY_MAP_PLACEHOLDER
      : variant === 'release'
        ? RELEASE_PLACEHOLDER
        : PROCESS_FLOW_PLACEHOLDER;

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const trimmed = draft.trim();
      await onSave(trimmed.length > 0 ? trimmed : null);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSave} className="flex flex-col gap-4 flex-1 min-h-0">
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={placeholder}
            disabled={saving}
            className="min-h-[240px] flex-1 font-mono text-sm"
          />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !hasChanges}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
