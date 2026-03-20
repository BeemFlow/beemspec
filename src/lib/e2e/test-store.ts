import type {
  CreateProcessFlow,
  CreateProcessFlowEdge,
  CreateProcessFlowNode,
  UpdateProcessFlow,
  UpdateProcessFlowEdge,
  UpdateProcessFlowNode,
} from '@beemspec/processflow';
import type { StoryStatus } from '@beemspec/storymap';
import { validateProcessFlowGraph } from '@/processflow/service';
import type {
  Activity,
  ProcessFlow,
  ProcessFlowEdge,
  ProcessFlowFull,
  ProcessFlowNode,
  ProcessFlowValidationResult,
  Release,
  Story,
  StoryMap,
  StoryMapFull,
  Task,
  TeamInvite,
  TeamMember,
} from '@/types';

const TEAM_ID = '00000000-0000-4000-8000-000000000001';

type StoreState = {
  teams: Array<{ id: string; name: string; created_at: string; updated_at: string; role: 'owner' }>;
  teamMembers: TeamMember[];
  teamInvites: TeamInvite[];
  storyMaps: E2EStoryMap[];
  processFlows: ProcessFlowFull[];
  counters: {
    flow: number;
    node: number;
    edge: number;
    storyMap: number;
    member: number;
    invite: number;
    user: number;
  };
};

type E2EStoryMap = StoryMapFull & {
  team_id: string;
};

type CreateStoryMapInput = {
  team_id: string;
  name: string;
  description?: string | null;
  context_markdown?: string | null;
};

type UpdateStoryMapInput = {
  name?: string;
  description?: string | null;
  context_markdown?: string | null;
};

type CreateActivityInput = { story_map_id: string; name: string; description?: string | null };
type UpdateActivityInput = { name?: string; description?: string | null };
type CreateTaskInput = { activity_id: string; name: string; description?: string | null };
type UpdateTaskInput = { name?: string; description?: string | null };
type CreateReleaseInput = {
  story_map_id: string;
  name: string;
  description?: string | null;
  context_markdown?: string | null;
};
type UpdateReleaseInput = { name?: string; description?: string | null; context_markdown?: string | null };
type CreateStoryInput = {
  task_id: string;
  release_id: string | null;
  title: string;
  status?: StoryStatus;
  content: Story['content'];
};
type UpdateStoryInput = {
  title?: string;
  status?: StoryStatus;
  content?: Story['content'];
};

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix: string, value: number) {
  return `${prefix}-${value}`;
}

function createInitialState(scenario: 'default' | 'malformed' = 'default'): StoreState {
  const ownerMember: TeamMember = {
    id: 'member-1',
    user_id: 'e2e-user-1',
    role: 'owner',
    email: 'e2e@example.com',
    created_at: nowIso(),
  };

  const release: Release = {
    id: 'release-1',
    story_map_id: 'story-map-1',
    name: 'Release 1',
    description: 'Initial release',
    context_markdown: null,
    sort_order: 0,
  };

  const story: Story = {
    id: 'story-1',
    task_id: 'task-1',
    release_id: 'release-1',
    title: 'Customer can submit invoice',
    status: 'backlog',
    content: {
      _version: 1,
      user_story: 'As a finance operator, I can submit an invoice for approval.',
      acceptance_criteria: '- [ ] Submission succeeds',
      figma_link: null,
      edge_cases: null,
      technical_guidelines: null,
    },
    sort_order: 0,
  };

  const task: Task & { stories: Story[] } = {
    id: 'task-1',
    activity_id: 'activity-1',
    name: 'Invoice submission',
    description: 'Capture and validate invoice intake.',
    sort_order: 0,
    stories: [story],
  };

  const activity: Activity & { tasks: Array<Task & { stories: Story[] }> } = {
    id: 'activity-1',
    story_map_id: 'story-map-1',
    name: 'Finance intake',
    description: 'Initial workflow activity.',
    sort_order: 0,
    tasks: [task],
  };

  const storyMap: E2EStoryMap = {
    id: 'story-map-1',
    team_id: TEAM_ID,
    name: 'Platform Core',
    description: 'Seeded story map',
    context_markdown: 'Seeded e2e fixture for story map testing.',
    activities: [activity],
    releases: [release],
  };

  const processFlow: ProcessFlowFull = {
    id: 'flow-1',
    team_id: TEAM_ID,
    name: 'Accounts Payable',
    description: 'Invoice intake and approval flow',
    context_markdown: 'Seeded e2e fixture for process flow testing.',
    viewport: null,
    schema_version: 1,
    nodes: [
      {
        id: 'node-1',
        process_flow_id: 'flow-1',
        type: 'step',
        position: { x: 120, y: 140 },
        size: null,
        data: { label: 'Receive invoice', owner_role: 'Operations' },
      },
      {
        id: 'node-2',
        process_flow_id: 'flow-1',
        type: 'decision',
        position: { x: 420, y: 140 },
        size: null,
        data: { label: 'Approved?', owner_role: 'Finance' },
      },
    ],
    edges: [
      {
        id: 'edge-1',
        process_flow_id: 'flow-1',
        type: 'flow',
        source_node_id: 'node-1',
        target_node_id: 'node-2',
        data: { label: 'Review' },
      },
    ],
  };

  if (scenario === 'malformed') {
    processFlow.nodes.push({
      id: 'node-bad',
      process_flow_id: 'flow-1',
      type: 'step',
      position: { x: Number.NaN, y: Number.POSITIVE_INFINITY },
      size: null,
      data: { label: '' },
    });
  }

  return {
    teams: [{ id: TEAM_ID, name: 'E2E Team', created_at: nowIso(), updated_at: nowIso(), role: 'owner' }],
    teamMembers: [ownerMember],
    teamInvites: [],
    storyMaps: [storyMap],
    processFlows: [processFlow],
    counters: { flow: 2, node: 3, edge: 2, storyMap: 2, member: 2, invite: 1, user: 2 },
  };
}

const globalStore = globalThis as typeof globalThis & { __beemspecE2EStore?: StoreState };

function getState(): StoreState {
  if (!globalStore.__beemspecE2EStore) {
    globalStore.__beemspecE2EStore = createInitialState();
  }
  return globalStore.__beemspecE2EStore;
}

export function resetE2EProcessFlowStore(scenario: 'default' | 'malformed' = 'default') {
  globalStore.__beemspecE2EStore = createInitialState(scenario);
}

export function getE2ETeams() {
  return getState().teams;
}

export function listE2ETeamMembers(teamId: string) {
  if (!getState().teams.some((team) => team.id === teamId)) return [];
  return getState().teamMembers;
}

export function listE2ETeamInvites(teamId: string) {
  return getState().teamInvites.filter((invite) => invite.team_id === teamId && invite.accepted_at === null);
}

export function createE2ETeamInvite(input: { team_id: string; email: string; invited_by: string }) {
  const state = getState();
  const invite: TeamInvite = {
    id: makeId('invite', state.counters.invite++),
    team_id: input.team_id,
    email: input.email,
    invited_by: input.invited_by,
    created_at: nowIso(),
    accepted_at: null,
  };
  state.teamInvites.unshift(invite);
  return invite;
}

export function deleteE2ETeamInvite(teamId: string, inviteId: string) {
  const state = getState();
  const invite = state.teamInvites.find((item) => item.id === inviteId && item.team_id === teamId) ?? null;
  if (!invite) return null;
  state.teamInvites = state.teamInvites.filter((item) => item.id !== inviteId);
  return invite;
}

export function acceptE2ETeamInvite(inviteId: string, email: string) {
  const state = getState();
  const invite = state.teamInvites.find(
    (item) => item.id === inviteId && item.accepted_at === null && item.email.toLowerCase() === email.toLowerCase(),
  );
  if (!invite) return null;

  invite.accepted_at = nowIso();

  const existingMember = state.teamMembers.find((member) => member.email.toLowerCase() === email.toLowerCase());
  if (existingMember) {
    return existingMember;
  }

  const member: TeamMember = {
    id: makeId('member', state.counters.member++),
    user_id: makeId('user', state.counters.user++),
    role: 'member',
    email,
    created_at: nowIso(),
  };
  state.teamMembers.push(member);
  return member;
}

export function listE2EStoryMaps(teamId: string) {
  return getState()
    .storyMaps.filter((map) => map.team_id === teamId)
    .map(({ activities: _activities, releases: _releases, team_id: _teamId, ...map }) => map);
}

export function getE2EStoryMap(id: string): StoryMapFull | null {
  return getState().storyMaps.find((map) => map.id === id) ?? null;
}

export function createE2EStoryMap(input: CreateStoryMapInput): StoryMap {
  const state = getState();
  const id = makeId('story-map', state.counters.storyMap++);
  const storyMap: E2EStoryMap = {
    id,
    team_id: input.team_id,
    name: input.name,
    description: input.description ?? null,
    context_markdown: input.context_markdown ?? null,
    activities: [],
    releases: [],
  };
  state.storyMaps.unshift(storyMap);
  const { activities: _activities, releases: _releases, team_id: _teamId, ...summary } = storyMap;
  return summary;
}

export function updateE2EStoryMap(id: string, changes: UpdateStoryMapInput): StoryMap | null {
  const map = getE2EStoryMap(id) as E2EStoryMap | null;
  if (!map) return null;
  Object.assign(map, changes);
  const { activities: _activities, releases: _releases, team_id: _teamId, ...summary } = map;
  return summary;
}

export function deleteE2EStoryMap(id: string): StoryMap | null {
  const state = getState();
  const map = state.storyMaps.find((item) => item.id === id) ?? null;
  if (!map) return null;
  state.storyMaps = state.storyMaps.filter((item) => item.id !== id);
  const { activities: _activities, releases: _releases, team_id: _teamId, ...summary } = map;
  return summary;
}

function nextSortOrder(items: Array<{ sort_order: number }>) {
  return items.length;
}

function findStoryMapByActivityId(activityId: string): E2EStoryMap | null {
  return getState().storyMaps.find((map) => map.activities.some((activity) => activity.id === activityId)) ?? null;
}

function findStoryMapByTaskId(taskId: string): E2EStoryMap | null {
  return (
    getState().storyMaps.find((map) =>
      map.activities.some((activity) => activity.tasks.some((task) => task.id === taskId)),
    ) ?? null
  );
}

function findStoryMapByStoryId(storyId: string): E2EStoryMap | null {
  return (
    getState().storyMaps.find((map) =>
      map.activities.some((activity) =>
        activity.tasks.some((task) => task.stories.some((story) => story.id === storyId)),
      ),
    ) ?? null
  );
}

function findStoryMapByReleaseId(releaseId: string): E2EStoryMap | null {
  return getState().storyMaps.find((map) => map.releases.some((release) => release.id === releaseId)) ?? null;
}

export function createE2EActivity(input: CreateActivityInput): Activity | null {
  const state = getState();
  const map = getE2EStoryMap(input.story_map_id) as E2EStoryMap | null;
  if (!map) return null;
  const activity: Activity & { tasks: Array<Task & { stories: Story[] }> } = {
    id: makeId('activity', state.counters.storyMap++),
    story_map_id: input.story_map_id,
    name: input.name,
    description: input.description ?? null,
    sort_order: nextSortOrder(map.activities),
    tasks: [],
  };
  map.activities.push(activity);
  const { tasks: _tasks, ...summary } = activity;
  return summary;
}

export function updateE2EActivity(id: string, changes: UpdateActivityInput): Activity | null {
  const map = findStoryMapByActivityId(id);
  const activity = map?.activities.find((item) => item.id === id);
  if (!activity) return null;
  Object.assign(activity, changes);
  const { tasks: _tasks, ...summary } = activity;
  return summary;
}

export function deleteE2EActivity(id: string): Activity | null {
  const map = findStoryMapByActivityId(id);
  if (!map) return null;
  const activity = map.activities.find((item) => item.id === id) ?? null;
  if (!activity) return null;
  map.activities = map.activities
    .filter((item) => item.id !== id)
    .map((item, index) => ({ ...item, sort_order: index }));
  const { tasks: _tasks, ...summary } = activity;
  return summary;
}

export function createE2ETask(input: CreateTaskInput): Task | null {
  const state = getState();
  const map = findStoryMapByActivityId(input.activity_id);
  const activity = map?.activities.find((item) => item.id === input.activity_id);
  if (!activity) return null;
  const task: Task & { stories: Story[] } = {
    id: makeId('task', state.counters.storyMap++),
    activity_id: input.activity_id,
    name: input.name,
    description: input.description ?? null,
    sort_order: nextSortOrder(activity.tasks),
    stories: [],
  };
  activity.tasks.push(task);
  const { stories: _stories, ...summary } = task;
  return summary;
}

export function updateE2ETask(id: string, changes: UpdateTaskInput): Task | null {
  const map = findStoryMapByTaskId(id);
  const task = map?.activities.flatMap((activity) => activity.tasks).find((item) => item.id === id);
  if (!task) return null;
  Object.assign(task, changes);
  const { stories: _stories, ...summary } = task;
  return summary;
}

export function deleteE2ETask(id: string): Task | null {
  const map = findStoryMapByTaskId(id);
  if (!map) return null;
  for (const activity of map.activities) {
    const task = activity.tasks.find((item) => item.id === id);
    if (!task) continue;
    activity.tasks = activity.tasks
      .filter((item) => item.id !== id)
      .map((item, index) => ({ ...item, sort_order: index }));
    const { stories: _stories, ...summary } = task;
    return summary;
  }
  return null;
}

export function createE2ERelease(input: CreateReleaseInput): Release | null {
  const state = getState();
  const map = getE2EStoryMap(input.story_map_id) as E2EStoryMap | null;
  if (!map) return null;
  const release: Release = {
    id: makeId('release', state.counters.storyMap++),
    story_map_id: input.story_map_id,
    name: input.name,
    description: input.description ?? null,
    context_markdown: input.context_markdown ?? null,
    sort_order: nextSortOrder(map.releases),
  };
  map.releases.push(release);
  return release;
}

export function updateE2ERelease(id: string, changes: UpdateReleaseInput): Release | null {
  const map = findStoryMapByReleaseId(id);
  const release = map?.releases.find((item) => item.id === id);
  if (!release) return null;
  Object.assign(release, changes);
  return release;
}

export function deleteE2ERelease(id: string): Release | null {
  const map = findStoryMapByReleaseId(id);
  if (!map) return null;
  const release = map.releases.find((item) => item.id === id) ?? null;
  if (!release) return null;
  map.releases = map.releases.filter((item) => item.id !== id).map((item, index) => ({ ...item, sort_order: index }));
  for (const activity of map.activities) {
    for (const task of activity.tasks) {
      task.stories = task.stories.map((story) => (story.release_id === id ? { ...story, release_id: null } : story));
    }
  }
  return release;
}

export function createE2EStory(input: CreateStoryInput): Story | null {
  const state = getState();
  const map = findStoryMapByTaskId(input.task_id);
  const task = map?.activities.flatMap((activity) => activity.tasks).find((item) => item.id === input.task_id);
  if (!task) return null;
  const story: Story = {
    id: makeId('story', state.counters.storyMap++),
    task_id: input.task_id,
    release_id: input.release_id,
    sort_order: nextSortOrder(task.stories.filter((item) => item.release_id === input.release_id)),
    status: input.status ?? 'backlog',
    title: input.title,
    content: input.content,
  };
  task.stories.push(story);
  return story;
}

export function updateE2EStory(id: string, changes: UpdateStoryInput): Story | null {
  const map = findStoryMapByStoryId(id);
  const story = map?.activities
    .flatMap((activity) => activity.tasks)
    .flatMap((task) => task.stories)
    .find((item) => item.id === id);
  if (!story) return null;
  Object.assign(story, changes);
  return story;
}

export function deleteE2EStory(id: string): Story | null {
  const map = findStoryMapByStoryId(id);
  if (!map) return null;
  for (const activity of map.activities) {
    for (const task of activity.tasks) {
      const story = task.stories.find((item) => item.id === id);
      if (!story) continue;
      task.stories = task.stories.filter((item) => item.id !== id);
      return story;
    }
  }
  return null;
}

export function listE2EProcessFlows(teamId: string): ProcessFlow[] {
  return getState()
    .processFlows.filter((flow) => flow.team_id === teamId)
    .map(({ nodes: _nodes, edges: _edges, ...flow }) => flow);
}

export function getE2EProcessFlow(id: string): ProcessFlowFull | null {
  return getState().processFlows.find((flow) => flow.id === id) ?? null;
}

export function createE2EProcessFlow(input: CreateProcessFlow): ProcessFlow {
  const state = getState();
  const id = makeId('flow', state.counters.flow++);
  const flow: ProcessFlowFull = {
    id,
    team_id: input.team_id,
    name: input.name,
    description: input.description ?? null,
    context_markdown: input.context_markdown ?? null,
    viewport: input.viewport ?? null,
    schema_version: 1,
    nodes: [],
    edges: [],
  };
  state.processFlows.unshift(flow);
  const { nodes: _nodes, edges: _edges, ...summary } = flow;
  return summary;
}

export function updateE2EProcessFlow(id: string, changes: UpdateProcessFlow): ProcessFlow | null {
  const flow = getE2EProcessFlow(id);
  if (!flow) return null;
  Object.assign(flow, changes);
  const { nodes: _nodes, edges: _edges, ...summary } = flow;
  return summary;
}

export function createE2EProcessFlowNode(input: CreateProcessFlowNode): ProcessFlowNode | null {
  const state = getState();
  const flow = getE2EProcessFlow(input.process_flow_id);
  if (!flow) return null;
  const node: ProcessFlowNode = {
    id: makeId('node', state.counters.node++),
    process_flow_id: input.process_flow_id,
    type: input.type,
    position: input.position,
    size: input.size ?? null,
    data: input.data,
  };
  flow.nodes.push(node);
  return node;
}

export function updateE2EProcessFlowNode(processFlowId: string, nodeId: string, changes: UpdateProcessFlowNode) {
  const flow = getE2EProcessFlow(processFlowId);
  const node = flow?.nodes.find((item) => item.id === nodeId);
  if (!node) return null;
  Object.assign(node, changes);
  return node;
}

export function deleteE2EProcessFlowNode(processFlowId: string, nodeId: string) {
  const flow = getE2EProcessFlow(processFlowId);
  if (!flow) return null;
  const node = flow.nodes.find((item) => item.id === nodeId) ?? null;
  if (!node) return null;
  flow.nodes = flow.nodes.filter((item) => item.id !== nodeId);
  flow.edges = flow.edges.filter((edge) => edge.source_node_id !== nodeId && edge.target_node_id !== nodeId);
  return node;
}

export function createE2EProcessFlowEdge(input: CreateProcessFlowEdge): ProcessFlowEdge | null {
  const state = getState();
  const flow = getE2EProcessFlow(input.process_flow_id);
  if (!flow) return null;
  const hasSource = flow.nodes.some((node) => node.id === input.source_node_id);
  const hasTarget = flow.nodes.some((node) => node.id === input.target_node_id);
  if (!hasSource || !hasTarget) return null;
  const duplicate = flow.edges.find(
    (edge) =>
      edge.type === input.type &&
      edge.source_node_id === input.source_node_id &&
      edge.target_node_id === input.target_node_id,
  );
  if (duplicate) return duplicate;
  const edge: ProcessFlowEdge = {
    id: makeId('edge', state.counters.edge++),
    process_flow_id: input.process_flow_id,
    type: input.type,
    source_node_id: input.source_node_id,
    target_node_id: input.target_node_id,
    data: input.data ?? null,
  };
  flow.edges.push(edge);
  return edge;
}

export function updateE2EProcessFlowEdge(processFlowId: string, edgeId: string, changes: UpdateProcessFlowEdge) {
  const flow = getE2EProcessFlow(processFlowId);
  const edge = flow?.edges.find((item) => item.id === edgeId);
  if (!edge) return null;
  Object.assign(edge, changes);
  return edge;
}

export function deleteE2EProcessFlowEdge(processFlowId: string, edgeId: string) {
  const flow = getE2EProcessFlow(processFlowId);
  if (!flow) return null;
  const edge = flow.edges.find((item) => item.id === edgeId) ?? null;
  if (!edge) return null;
  flow.edges = flow.edges.filter((item) => item.id !== edgeId);
  return edge;
}

export function batchMutateE2EProcessFlowNodes(
  processFlowId: string,
  mutations: Array<{ action: 'create' | 'update' | 'delete'; id?: string; payload?: unknown }>,
) {
  const created: ProcessFlowNode[] = [];
  const updated: ProcessFlowNode[] = [];
  const deleted: ProcessFlowNode[] = [];
  for (const mutation of mutations) {
    if (mutation.action === 'create') {
      const node = createE2EProcessFlowNode({
        ...(mutation.payload as CreateProcessFlowNode),
        process_flow_id: processFlowId,
      });
      if (!node) throw new Error('Failed to create process flow node');
      created.push(node);
    } else if (mutation.action === 'update') {
      const node = updateE2EProcessFlowNode(
        processFlowId,
        mutation.id ?? '',
        mutation.payload as UpdateProcessFlowNode,
      );
      if (!node) throw new Error('Failed to update process flow node');
      updated.push(node);
    } else {
      const node = deleteE2EProcessFlowNode(processFlowId, mutation.id ?? '');
      if (!node) throw new Error('Failed to delete process flow node');
      deleted.push(node);
    }
  }
  return { created, updated, deleted };
}

export function batchMutateE2EProcessFlowEdges(
  processFlowId: string,
  mutations: Array<{ action: 'create' | 'update' | 'delete'; id?: string; payload?: unknown }>,
) {
  const created: ProcessFlowEdge[] = [];
  const updated: ProcessFlowEdge[] = [];
  const deleted: ProcessFlowEdge[] = [];
  for (const mutation of mutations) {
    if (mutation.action === 'create') {
      const edge = createE2EProcessFlowEdge({
        ...(mutation.payload as CreateProcessFlowEdge),
        process_flow_id: processFlowId,
      });
      if (!edge) throw new Error('Failed to create process flow edge');
      created.push(edge);
    } else if (mutation.action === 'update') {
      const edge = updateE2EProcessFlowEdge(
        processFlowId,
        mutation.id ?? '',
        mutation.payload as UpdateProcessFlowEdge,
      );
      if (!edge) throw new Error('Failed to update process flow edge');
      updated.push(edge);
    } else {
      const edge = deleteE2EProcessFlowEdge(processFlowId, mutation.id ?? '');
      if (!edge) throw new Error('Failed to delete process flow edge');
      deleted.push(edge);
    }
  }
  return { created, updated, deleted };
}

export function validateE2EProcessFlow(id: string): ProcessFlowValidationResult | null {
  const flow = getE2EProcessFlow(id);
  return flow ? validateProcessFlowGraph(flow) : null;
}

export function autolayoutE2EProcessFlow(id: string): Pick<ProcessFlowFull, 'nodes' | 'edges'> | null {
  const flow = getE2EProcessFlow(id);
  if (!flow) return null;
  flow.nodes = flow.nodes.map((node, index) => ({
    ...node,
    position: { x: 120 + (index % 3) * 300, y: 140 + Math.floor(index / 3) * 180 },
  }));
  return { nodes: flow.nodes, edges: flow.edges };
}

export function getE2EAuthUser() {
  return { id: 'e2e-user-1', email: 'e2e@example.com' };
}

export function getE2ETeamId() {
  return TEAM_ID;
}
