import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { env } from '@/lib/env';

interface OpenCodeProject {
  id: string;
  worktree?: string;
}

interface OpenCodeSession {
  id: string;
  directory?: string;
}

export async function GET() {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const baseUrl = env.openCodeBaseUrl();
  const fetchOpts = { cache: 'no-store' as const };

  try {
    const [projectsRes, sessionsRes] = await Promise.all([
      fetch(`${baseUrl}/project`, fetchOpts),
      fetch(`${baseUrl}/session`, fetchOpts),
    ]);

    const directories = new Map<string, string>();

    if (projectsRes.ok) {
      const projects: OpenCodeProject[] = await projectsRes.json();
      for (const p of Array.isArray(projects) ? projects : []) {
        if (p.worktree && p.worktree !== '/') {
          directories.set(p.worktree, p.id);
        }
      }
    }

    if (sessionsRes.ok) {
      const sessions: OpenCodeSession[] = await sessionsRes.json();
      for (const s of Array.isArray(sessions) ? sessions : []) {
        if (s.directory && s.directory !== '/' && !directories.has(s.directory)) {
          directories.set(s.directory, s.id);
        }
      }
    }

    if (directories.size === 0 && !projectsRes.ok) {
      return NextResponse.json({ error: 'Failed to fetch OpenCode projects' }, { status: 502 });
    }

    const mapped = [...directories.entries()]
      .map(([path, id]) => ({ id, path }))
      .sort((a, b) => a.path.localeCompare(b.path));

    return NextResponse.json(mapped);
  } catch {
    return NextResponse.json({ error: 'OpenCode is not reachable' }, { status: 503 });
  }
}
