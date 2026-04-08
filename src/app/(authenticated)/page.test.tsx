/* @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { cookiesMock, createClientMock, listTeamsForUserMock, listStoryMapsMock, listProcessFlowsMock } = vi.hoisted(
  () => ({
    cookiesMock: vi.fn(),
    createClientMock: vi.fn(),
    listTeamsForUserMock: vi.fn(),
    listStoryMapsMock: vi.fn(),
    listProcessFlowsMock: vi.fn(),
  }),
);

vi.mock('next/headers', () => ({ cookies: cookiesMock }));
vi.mock('@/lib/supabase/server', () => ({ createClient: createClientMock }));
vi.mock('@/lib/teams', () => ({ listTeamsForUser: listTeamsForUserMock }));
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
    cookiesMock.mockResolvedValue({ get: vi.fn().mockReturnValue(null) });
    createClientMock.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
    });
    listTeamsForUserMock.mockResolvedValue({ data: [], error: null });

    render(await Dashboard());

    expect(screen.getByText('Create or select a team to get started')).toBeTruthy();
  });

  it('renders story map and process flow collections for the resolved current team', async () => {
    cookiesMock.mockResolvedValue({ get: vi.fn().mockReturnValue({ value: 'team-2' }) });
    createClientMock.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
    });
    listTeamsForUserMock.mockResolvedValue({ data: [{ team_id: 'team-1' }, { team_id: 'team-2' }], error: null });
    listStoryMapsMock.mockResolvedValue({ data: [{ id: 'map-1', name: 'Platform Core' }], error: null });
    listProcessFlowsMock.mockResolvedValue({ data: [{ id: 'flow-1', name: 'Accounts Payable' }], error: null });

    render(await Dashboard());

    expect(screen.getByRole('heading', { name: 'Story Maps' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Process Flows' })).toBeTruthy();
    expect(screen.getByText('Platform Core')).toBeTruthy();
    expect(screen.getByText('Accounts Payable')).toBeTruthy();
    expect(listStoryMapsMock).toHaveBeenCalledWith(expect.anything(), 'team-2');
    expect(listProcessFlowsMock).toHaveBeenCalledWith(expect.anything(), 'team-2');
  });
});
