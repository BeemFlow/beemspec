'use client';

import { Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Activity } from '@/types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activity: Activity | null;
  onSave: (data: { name: string }) => void;
  onDelete?: () => void;
}

export function ActivityDialog({ open, onOpenChange, activity, onSave, onDelete }: Props) {
  const [name, setName] = useState('');

  // biome-ignore lint/correctness/useExhaustiveDependencies: open is intentionally included to reset form when dialog opens
  useEffect(() => {
    if (activity) {
      setName(activity.name);
    } else {
      setName('');
    }
  }, [activity, open]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim()) {
      onSave({ name: name.trim() });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
              required
            />
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
              <Button type="submit" disabled={!name.trim()}>
                Save
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
