import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { GET as getProcessFlows, POST as postProcessFlow } from './route';

vi.mock('@/lib/auth', () => ({
  requireAuth: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

const TEAM_ID = 'd7f34189-5d27-4dc0-b2c5-23d11796add4';

function createProcessFlowsClient(options?: { teams?: string[] }) {
  const memberships = (options?.teams ?? [TEAM_ID]).map((teamId) => ({ team_id: teamId, role: 'owner' }));
  const teams = (options?.teams ?? [TEAM_ID]).map((teamId, idx) => ({ id: teamId, name: `Team ${idx + 1}` }));

  const teamMembersEq = vi.fn().mockResolvedValue({ data: memberships, error: null });
  const teamMembersSelect = vi.fn().mockReturnValue({ eq: teamMembersEq });

  const teamsIn = vi.fn().mockResolvedValue({ data: teams, error: null });
  const teamsSelect = vi.fn().mockReturnValue({ in: teamsIn });

  const processFlowsOrder = vi.fn().mockResolvedValue({ data: [{ id: 'flow-1', name: 'AP Intake' }], error: null });
  const processFlowsEq = vi.fn().mockReturnValue({ order: processFlowsOrder });
  const processFlowsSelect = vi.fn().mockReturnValue({ eq: processFlowsEq });

  const from = vi.fn((table: string) => {
    if (table === 'team_members') return { select: teamMembersSelect };
    if (table === 'teams') return { select: teamsSelect };
    if (table === 'process_flows') return { select: processFlowsSelect };
    throw new Error(`Unexpected table: ${table}`);
  });

  return { client: { from }, processFlowsEq };
}

describe('process flows route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({ success: true, user: { id: 'user-1' } } as never);
  });

  it('lists process flows for explicit accessible team', async () => {
    const { client, processFlowsEq } = createProcessFlowsClient();
    vi.mocked(createClient).mockResolvedValue(client as never);

    const response = await getProcessFlows(new Request(`http://localhost/api/process-flows?team_id=${TEAM_ID}`));

    expect(response.status).toBe(200);
    expect(processFlowsEq).toHaveBeenCalledWith('team_id', TEAM_ID);
  });

  it('creates a process flow with context markdown', async () => {
    const single = vi.fn().mockResolvedValue({
      data: { id: 'flow-1', name: 'AP Intake', context_markdown: 'Interview notes' },
      error: null,
    });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });
    const from = vi.fn((table: string) => {
      if (table === 'process_flows') return { insert };
      throw new Error(`Unexpected table: ${table}`);
    });
    vi.mocked(createClient).mockResolvedValue({ from } as never);

    const response = await postProcessFlow(
      new Request('http://localhost/api/process-flows', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          team_id: TEAM_ID,
          name: 'AP Intake',
          context_markdown: 'Interview notes',
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(insert).toHaveBeenCalledWith({
      team_id: TEAM_ID,
      name: 'AP Intake',
      description: null,
      context_markdown: 'Interview notes',
      viewport: null,
      schema_version: 1,
    });
  });
});
