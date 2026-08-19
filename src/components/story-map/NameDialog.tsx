'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { DeleteButton } from '@/components/ui/delete-button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { nonCredentialFieldProps, nonCredentialFormProps } from '@/components/ui/non-credential-fields';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemId: string | null;
  initialName: string;
  title: string;
  inputId: string;
  placeholder: string;
  onSave: (data: { name: string }) => Promise<void> | void;
  onDelete?: () => Promise<void> | void;
  deleteTitle: string;
  deleteDescription: string;
}

export function NameDialog(props: Props) {
  const resetKey = `${props.open ? 'open' : 'closed'}:${props.itemId ?? 'new'}`;
  return <NameDialogForm key={resetKey} {...props} />;
}

function NameDialogForm({
  open,
  onOpenChange,
  initialName,
  title,
  inputId,
  placeholder,
  onSave,
  onDelete,
  deleteTitle,
  deleteDescription,
}: Props) {
  const [name, setName] = useState(initialName);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
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
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form {...nonCredentialFormProps} onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={inputId}>Name</Label>
            <Input
              id={inputId}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={placeholder}
              disabled={isSubmitting}
              required
              {...nonCredentialFieldProps}
            />
          </div>

          <div className="flex justify-between pt-4">
            {onDelete ? (
              <DeleteButton
                onDelete={handleDelete}
                confirmTitle={deleteTitle}
                confirmDescription={deleteDescription}
                loading={isSubmitting}
              />
            ) : null}
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
