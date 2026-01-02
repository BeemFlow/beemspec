'use client';

import { Map as MapIcon, Plus } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useTeam } from '@/lib/contexts/team-context';
import type { StoryMap } from '@/types';

export default function Dashboard() {
  const { currentTeam } = useTeam();
  const [storyMaps, setStoryMaps] = useState<StoryMap[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (!currentTeam) return;

    setLoading(true);
    fetch(`/api/story-maps?team_id=${currentTeam.id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
        } else {
          setStoryMaps(data);
        }
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [currentTeam]);

  async function createStoryMap(e: React.FormEvent) {
    e.preventDefault();
    if (!currentTeam) return;

    const res = await fetch('/api/story-maps', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ team_id: currentTeam.id, name, description }),
    });
    const data = await res.json();
    if (data.error) {
      setError(data.error);
      return;
    }
    setStoryMaps([data, ...storyMaps]);
    setName('');
    setDescription('');
    setOpen(false);
  }

  const showEmpty = !loading && currentTeam && storyMaps.length === 0;
  const showGrid = !loading && currentTeam && storyMaps.length > 0;

  return (
    <div className="p-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-3xl font-bold">Story Maps</h1>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button disabled={!currentTeam}>
                <Plus className="mr-2 h-4 w-4" />
                New Story Map
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Story Map</DialogTitle>
              </DialogHeader>
              <form onSubmit={createStoryMap} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="My Product"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="A brief description..."
                  />
                </div>
                <Button type="submit" className="w-full">
                  Create
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {error ? (
          <Card className="border-destructive bg-destructive/5 p-6">
            <p className="text-destructive">{error}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => {
                setError(null);
                setLoading(true);
                fetch(`/api/story-maps?team_id=${currentTeam?.id}`)
                  .then((r) => r.json())
                  .then((data) => {
                    if (data.error) setError(data.error);
                    else setStoryMaps(data);
                    setLoading(false);
                  })
                  .catch((err) => {
                    setError(err.message);
                    setLoading(false);
                  });
              }}
            >
              Retry
            </Button>
          </Card>
        ) : loading ? (
          <p className="text-muted-foreground">Loading...</p>
        ) : showEmpty ? (
          <Card className="border-dashed p-8 text-center">
            <MapIcon className="mx-auto h-12 w-12 text-muted-foreground/50" />
            <h3 className="mt-4 font-medium">No story maps yet</h3>
            <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
              Story maps help you plan your product from the user&apos;s perspective. Start by mapping out the user
              journey.
            </p>
            <Button className="mt-6" onClick={() => setOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create your first story map
            </Button>
          </Card>
        ) : showGrid ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {storyMaps.map((map) => (
              <Link key={map.id} href={`/story-map/${map.id}`}>
                <Card className="transition-colors hover:bg-muted/50">
                  <CardHeader>
                    <CardTitle>{map.name}</CardTitle>
                    {map.description && <CardDescription>{map.description}</CardDescription>}
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
