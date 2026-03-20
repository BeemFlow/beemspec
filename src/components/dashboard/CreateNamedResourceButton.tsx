'use client';

import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { nonCredentialFieldProps, nonCredentialFormProps } from '@/components/ui/non-credential-fields';
import { Textarea } from '@/components/ui/textarea';
import { errorMessage } from '@/lib/errors';
import { fetchJson } from '@/lib/http';

interface CreateNamedResourceButtonProps {
  teamId: string | null;
  endpoint: string;
  dialogTitle: string;
  triggerLabel: string;
  emptyTriggerLabel?: string;
  placeholderName: string;
  empty?: boolean;
  buildPayload: (teamId: string, name: string, description: string) => unknown;
}

export function CreateNamedResourceButton({
  teamId,
  endpoint,
  dialogTitle,
  triggerLabel,
  emptyTriggerLabel,
  placeholderName,
  empty = false,
  buildPayload,
}: CreateNamedResourceButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameId = useId();
  const descriptionId = useId();

  async function createResource(event: React.FormEvent) {
    event.preventDefault();
    if (!teamId || isCreating) return;

    try {
      setIsCreating(true);
      setError(null);
      await fetchJson(
        endpoint,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildPayload(teamId, name, description)),
        },
        `Failed to create ${dialogTitle.toLowerCase()}`,
      );
      setName('');
      setDescription('');
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setIsCreating(false);
    }
  }

  const trigger = empty ? (
    <Button className="mt-6" disabled={!teamId}>
      <Plus className="mr-2 h-4 w-4" />
      {emptyTriggerLabel ?? triggerLabel}
    </Button>
  ) : (
    <Button disabled={!teamId}>
      <Plus className="mr-2 h-4 w-4" />
      {triggerLabel}
    </Button>
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
        </DialogHeader>
        <form {...nonCredentialFormProps} onSubmit={createResource} className="space-y-4">
          {error ? (
            <Card className="border-destructive bg-destructive/5 p-4">
              <p className="text-sm text-destructive">{error}</p>
            </Card>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor={nameId}>Name</Label>
            <Input
              id={nameId}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={placeholderName}
              required
              {...nonCredentialFieldProps}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={descriptionId}>Description</Label>
            <Textarea
              id={descriptionId}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="A brief description..."
              {...nonCredentialFieldProps}
            />
          </div>
          <Button type="submit" className="w-full" disabled={isCreating || !name.trim()}>
            {isCreating ? 'Creating...' : 'Create'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
