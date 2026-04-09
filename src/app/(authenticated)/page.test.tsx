/* @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { getAppContextMock, listStoryMapsMock, listProcessFlowsMock } = vi.hoisted(() => ({
  getAppContextMock: vi.fn(),
  listStoryMapsMock: vi.fn(),
  listProcessFlowsMock: vi.fn(),
}));

vi.mock('@/lib/app-context', () => ({ getAppContext: getAppContextMock }));
vi.mock('@/storymap/service', () => ({ listStoryMaps: listStoryMapsMock }));
vi.mock('@/processflow/service', () => ({ listProcessFlows: listProcessFlowsMock }));
vi.mock('@/components/dashboard/ResourceCollectionSection', () => ({
  ResourceCollectionSection: ({ title, items }: { title: string; items: Array<{ name: string }> }) => (
    <section>
      <h2>{title}</h2>
      <div>{items.map((item) => item.name).join(', ')}</div>
    </section>
  ),
}));
vi.mock('@/components/story-map/CreateStoryMapButton', () => ({
  CreateStoryMapButton: () => <button type="button">New Story Map</button>,
}));
vi.mock('@/components/process-flow/CreateProcessFlowButton', () => ({
  CreateProcessFlowButton: () => <button type="button">New Process Flow</button>,
}));
vi.mock('@/components/ui/card', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import Dashboard from './page';

describe('authenticated dashboard page', () => {
  afterEach(() => {
    cleanup();
  });

  it('shows a no-team empty state when no accessible team is selected', async () => {
    getAppContextMock.mockResolvedValue({
      supabase: {},
      user: { id: 'user-1' },
      teams: [],
      currentTeamId: null,
    });

    render(await Dashboard());

    expect(screen.getByText('Create or select a team to get started')).toBeTruthy();
  });

  it('renders story map and process flow collections for the resolved current team', async () => {
    getAppContextMock.mockResolvedValue({
      supabase: { tag: 'supabase' },
      user: { id: 'user-1' },
      teams: [
        { id: 'team-1', role: 'owner' },
        { id: 'team-2', role: 'member' },
      ],
      currentTeamId: 'team-2',
    });
    listStoryMapsMock.mockResolvedValue({ data: [{ id: 'map-1', name: 'Platform Core' }], error: null });
    listProcessFlowsMock.mockResolvedValue({ data: [{ id: 'flow-1', name: 'Accounts Payable' }], error: null });

    render(await Dashboard());

    expect(screen.getByRole('heading', { name: 'Story Maps' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Process Flows' })).toBeTruthy();
    expect(screen.getByText('Platform Core')).toBeTruthy();
    expect(screen.getByText('Accounts Payable')).toBeTruthy();
    expect(listStoryMapsMock).toHaveBeenCalledWith({ tag: 'supabase' }, 'team-2');
    expect(listProcessFlowsMock).toHaveBeenCalledWith({ tag: 'supabase' }, 'team-2');
  });
});
