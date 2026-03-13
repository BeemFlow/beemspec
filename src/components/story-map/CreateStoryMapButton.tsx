'use client';

import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Textarea } from '@/components/ui/Textarea';
import { errorMessage } from '@/lib/errors';
import { fetchJson } from '@/lib/http';
import type { StoryMap } from '@/types';

interface CreateStoryMapButtonProps {
  teamId: string | null;
  empty?: boolean;
}

export function CreateStoryMapButton({ teamId, empty = false }: CreateStoryMapButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createStoryMap(event: React.FormEvent) {
    event.preventDefault();
    if (!teamId || isCreating) return;

    try {
      setIsCreating(true);
      setError(null);
      await fetchJson<StoryMap>(
        '/api/story-maps',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ team_id: teamId, name, description }),
        },
        'Failed to create story map',
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
      Create your first story map
    </Button>
  ) : (
    <Button disabled={!teamId}>
      <Plus className="mr-2 h-4 w-4" />
      New Story Map
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Story Map</DialogTitle>
        </DialogHeader>
        <form onSubmit={createStoryMap} className="space-y-4">
          {error && (
            <Card className="border-destructive bg-destructive/5 p-4">
              <p className="text-sm text-destructive">{error}</p>
            </Card>
          )}
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="My Product"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="A brief description..."
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
