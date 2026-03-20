'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { DeleteButton } from '@/components/ui/DeleteButton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Activity } from '@/types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activity: Activity | null;
  onSave: (data: { name: string }) => Promise<void> | void;
  onDelete?: () => Promise<void> | void;
}

export function ActivityDialog({ open, onOpenChange, activity, onSave, onDelete }: Props) {
  const [name, setName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: open is intentionally included to reset form when dialog opens
  useEffect(() => {
    if (activity) {
      setName(activity.name);
    } else {
      setName('');
    }
  }, [activity, open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || isSubmitting) return;

    try {
      setIsSubmitting(true);
      await onSave({ name: name.trim() });
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{activity ? 'Edit Activity' : 'New Activity'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="activity-name">Name</Label>
            <Input
              id="activity-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="User Registration"
              disabled={isSubmitting}
              required
            />
          </div>

          <div className="flex justify-between pt-4">
            {onDelete && (
              <DeleteButton
                onDelete={handleDelete}
                confirmTitle="Delete activity?"
                confirmDescription="All tasks and stories in this activity will be permanently deleted."
                loading={isSubmitting}
              />
            )}
            <div className="ml-auto flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={!name.trim() || isSubmitting}>
                {isSubmitting ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
