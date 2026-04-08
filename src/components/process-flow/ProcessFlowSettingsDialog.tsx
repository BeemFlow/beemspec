'use client';

import { Check, Copy, Loader2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { DangerZone } from '@/components/ui/danger-zone';
import { DeleteButton } from '@/components/ui/delete-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { nonCredentialFieldProps, nonCredentialFormProps } from '@/components/ui/non-credential-fields';
import { SettingsDialog } from '@/components/ui/settings-dialog';
import { Textarea } from '@/components/ui/textarea';
import { useCopyToClipboard } from '@/lib/use-copy-to-clipboard';

type ProcessFlowSettingsTab = 'general' | 'embed' | 'danger';

interface ProcessFlowSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  processFlowName: string;
  processFlowDescription: string | null | undefined;
  onSave: (changes: { name?: string; description?: string | null }) => Promise<void>;
  onCreateShareLink: () => Promise<string>;
  onDelete: () => Promise<void>;
}

function asInputValue(value: string | null | undefined): string {
  return value ?? '';
}

function buildIframeCode(url: string): string {
  return [
    '<iframe',
    `  src="${url}"`,
    '  width="100%"',
    '  height="640"',
    '  loading="lazy"',
    '  style="border:0;"',
    '></iframe>',
  ].join('\n');
}

function CopyFieldButton({
  value,
  copied,
  label,
  onCopy,
}: {
  value: string;
  copied: boolean;
  label: string;
  onCopy: () => Promise<unknown>;
}) {
  return (
    <Button type="button" variant="outline" size="sm" onClick={() => void onCopy()} disabled={!value}>
      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      {copied ? 'Copied' : label}
    </Button>
  );
}

export function ProcessFlowSettingsDialog({
  open,
  onOpenChange,
  processFlowName,
  processFlowDescription,
  onSave,
  onCreateShareLink,
  onDelete,
}: ProcessFlowSettingsDialogProps) {
  const [activeTab, setActiveTab] = useState<ProcessFlowSettingsTab>('general');
  const [name, setName] = useState(processFlowName);
  const [description, setDescription] = useState(asInputValue(processFlowDescription));
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [embedUrl, setEmbedUrl] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const embedLinkCopy = useCopyToClipboard();
  const embedCodeCopy = useCopyToClipboard();
  const resetEmbedLinkCopy = embedLinkCopy.reset;
  const resetEmbedCodeCopy = embedCodeCopy.reset;

  useEffect(() => {
    if (!open) return;
    setName(processFlowName);
    setDescription(asInputValue(processFlowDescription));
    setActiveTab('general');
    setEmbedUrl(null);
    resetEmbedLinkCopy();
    resetEmbedCodeCopy();
    setError(null);
  }, [open, processFlowDescription, processFlowName, resetEmbedCodeCopy, resetEmbedLinkCopy]);

  const hasChanges = useMemo(
    () => name.trim() !== processFlowName || description.trim() !== asInputValue(processFlowDescription).trim(),
    [description, name, processFlowDescription, processFlowName],
  );
  const iframeCode = useMemo(() => (embedUrl ? buildIframeCode(embedUrl) : ''), [embedUrl]);

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    if (saving || !name.trim() || !hasChanges) return;

    try {
      setSaving(true);
      setError(null);
      await onSave({
        name: name.trim(),
        description: description.trim() ? description.trim() : null,
      });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save process flow settings');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (deleting) return;

    try {
      setDeleting(true);
      setError(null);
      await onDelete();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete process flow');
    } finally {
      setDeleting(false);
    }
  }

  async function handleCreateShareLink() {
    if (generating) return;

    try {
      setGenerating(true);
      setError(null);
      const nextUrl = await onCreateShareLink();
      setEmbedUrl(nextUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create share link');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <SettingsDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!saving && !deleting) onOpenChange(nextOpen);
      }}
      title="Process Flow Settings"
      activeTab={activeTab}
      onTabChange={(value) => setActiveTab(value as ProcessFlowSettingsTab)}
      error={error}
      tabs={[
        {
          value: 'general',
          label: 'General',
          content: (
            <form {...nonCredentialFormProps} onSubmit={handleSave} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="process-flow-name">Name</Label>
                <Input
                  id="process-flow-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  disabled={saving}
                  {...nonCredentialFieldProps}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="process-flow-description">Description</Label>
                <Textarea
                  id="process-flow-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Optional description"
                  disabled={saving}
                  {...nonCredentialFieldProps}
                />
              </div>

              <Button type="submit" disabled={saving || !name.trim() || !hasChanges}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
              </Button>
            </form>
          ),
        },
        {
          value: 'embed',
          label: 'Embed',
          content: (
            <div className="min-w-0 space-y-4">
              <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                Generate a private share link for embedding this process flow as a read-only viewer.
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="process-flow-embed-url">Embed Link</Label>
                  <CopyFieldButton
                    value={embedUrl ?? ''}
                    copied={embedLinkCopy.copied}
                    label="Copy Link"
                    onCopy={() => embedLinkCopy.copy(embedUrl ?? '')}
                  />
                </div>
                <Input
                  id="process-flow-embed-url"
                  value={embedUrl ?? ''}
                  placeholder="Generate a link to copy it here"
                  readOnly
                  className="font-mono text-xs"
                  {...nonCredentialFieldProps}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="process-flow-embed-iframe">Embed Code</Label>
                  <CopyFieldButton
                    value={iframeCode}
                    copied={embedCodeCopy.copied}
                    label="Copy Code"
                    onCopy={() => embedCodeCopy.copy(iframeCode)}
                  />
                </div>
                <Textarea
                  id="process-flow-embed-iframe"
                  value={iframeCode}
                  placeholder="Generate a link to render the iframe snippet here"
                  readOnly
                  rows={7}
                  className="field-sizing-fixed max-w-full whitespace-pre-wrap break-all font-mono text-xs leading-5"
                  {...nonCredentialFieldProps}
                />
              </div>

              <Button type="button" onClick={handleCreateShareLink} disabled={generating}>
                {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
                {generating ? 'Generating...' : 'Generate Link'}
              </Button>
            </div>
          ),
        },
        {
          value: 'danger',
          label: 'Danger',
          content: (
            <DangerZone description="Deleting this process flow permanently removes all nodes, edges, and context in it.">
              <DeleteButton
                onDelete={handleDelete}
                loading={deleting}
                label="Delete process flow"
                confirmTitle="Delete process flow"
                confirmDescription="This action cannot be undone. All process flow content will be permanently deleted."
                confirmText={processFlowName}
              />
            </DangerZone>
          ),
        },
      ]}
    />
  );
}
