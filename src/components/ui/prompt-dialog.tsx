'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface PromptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  label?: string;
  placeholder?: string;
  defaultValue?: string;
  onSubmit: (value: string) => Promise<void> | void;
  submitLabel?: string;
  submittingLabel?: string;
}

export function PromptDialog({
  open,
  onOpenChange,
  title,
  label,
  placeholder,
  defaultValue = '',
  onSubmit,
  submitLabel = 'Save',
  submittingLabel = 'Saving...',
}: PromptDialogProps) {
  const [value, setValue] = useState(defaultValue);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setValue(defaultValue);
    }
  }, [open, defaultValue]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim() || isSubmitting) return;

    try {
      setIsSubmitting(true);
      await onSubmit(value.trim());
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !isSubmitting && onOpenChange(nextOpen)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            {label && <Label htmlFor="prompt-input">{label}</Label>}
            <Input
              id="prompt-input"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={placeholder}
              disabled={isSubmitting}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={!value.trim() || isSubmitting}>
              {isSubmitting ? submittingLabel : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
