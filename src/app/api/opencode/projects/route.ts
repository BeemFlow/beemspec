import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { env } from '@/lib/env';

export async function GET() {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const baseUrl = env.openCodeBaseUrl();
  try {
    const response = await fetch(`${baseUrl}/project`, { cache: 'no-store' });
    if (!response.ok) {
      return NextResponse.json({ error: 'Failed to fetch OpenCode projects' }, { status: 502 });
    }

    const projects = await response.json();
    const mapped = (Array.isArray(projects) ? projects : [])
      .filter((p: { worktree?: string }) => p.worktree && p.worktree !== '/')
      .map((p: { id: string; worktree: string }) => ({
        id: p.id,
        path: p.worktree,
      }));

    return NextResponse.json(mapped);
  } catch {
    return NextResponse.json({ error: 'OpenCode is not reachable' }, { status: 503 });
  }
}
