'use client';

import { Loader2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { DangerZone } from '@/components/ui/danger-zone';
import { DeleteButton } from '@/components/ui/delete-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SettingsDialog } from '@/components/ui/settings-dialog';
import { Textarea } from '@/components/ui/textarea';

type ProcessFlowSettingsTab = 'general' | 'danger';

interface ProcessFlowSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  processFlowName: string;
  processFlowDescription: string | null | undefined;
  onSave: (changes: { name?: string; description?: string | null }) => Promise<void>;
  onDelete: () => Promise<void>;
}

function asInputValue(value: string | null | undefined): string {
  return value ?? '';
}

export function ProcessFlowSettingsDialog({
  open,
  onOpenChange,
  processFlowName,
  processFlowDescription,
  onSave,
  onDelete,
}: ProcessFlowSettingsDialogProps) {
  const [activeTab, setActiveTab] = useState<ProcessFlowSettingsTab>('general');
  const [name, setName] = useState(processFlowName);
  const [description, setDescription] = useState(asInputValue(processFlowDescription));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(processFlowName);
    setDescription(asInputValue(processFlowDescription));
    setActiveTab('general');
    setError(null);
  }, [open, processFlowName, processFlowDescription]);

  const hasChanges = useMemo(
    () => name.trim() !== processFlowName || description.trim() !== asInputValue(processFlowDescription).trim(),
    [description, name, processFlowDescription, processFlowName],
  );

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
            <form onSubmit={handleSave} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="process-flow-name">Name</Label>
                <Input
                  id="process-flow-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  disabled={saving}
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
                />
              </div>

              <Button type="submit" disabled={saving || !name.trim() || !hasChanges}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
              </Button>
            </form>
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
