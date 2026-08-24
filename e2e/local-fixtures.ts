import { createClient, type SupabaseClient } from '@supabase/supabase-js';

type ResetScenario = 'default' | 'malformed';

export const E2E_OWNER_EMAIL = 'e2e-owner@example.com';
export const E2E_OWNER_PASSWORD = 'password123';
export const E2E_INVITEE_EMAIL = 'invitee@example.com';
export const E2E_INVITEE_PASSWORD = 'password123';
export const MAILPIT_BASE_URL = process.env.MAILPIT_URL?.trim() || 'http://127.0.0.1:55324';

export const E2E_TEAM_ID = '00000000-0000-4000-8000-000000000001';
export const E2E_SECOND_TEAM_ID = '00000000-0000-4000-8000-000000000002';
export const E2E_STORY_MAP_ID = '10000000-0000-4000-8000-000000000001';
export const E2E_SECOND_STORY_MAP_ID = '10000000-0000-4000-8000-000000000002';
const E2E_ACTIVITY_ID = '10000000-0000-4000-8000-000000000011';
const E2E_TASK_ID = '10000000-0000-4000-8000-000000000021';
const E2E_RELEASE_ID = '10000000-0000-4000-8000-000000000031';
const E2E_STORY_ID = '10000000-0000-4000-8000-000000000041';

export const E2E_PROCESS_FLOW_ID = '20000000-0000-4000-8000-000000000001';
export const E2E_NODE_RECEIVE_ID = '20000000-0000-4000-8000-000000000011';
export const E2E_NODE_APPROVED_ID = '20000000-0000-4000-8000-000000000021';
export const E2E_EDGE_REVIEW_ID = '20000000-0000-4000-8000-000000000031';

type AuthUser = {
  id: string;
  email?: string;
};

function requiredEnv(
  name: 'NEXT_PUBLIC_SUPABASE_URL' | 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY' | 'SUPABASE_SECRET_KEY',
) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing ${name}. Populate local Supabase env vars before running Playwright.`);
  }
  return value;
}

export function createAdminClient() {
  return createClient(requiredEnv('NEXT_PUBLIC_SUPABASE_URL'), requiredEnv('SUPABASE_SECRET_KEY'), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function createPublicClient() {
  return createClient(requiredEnv('NEXT_PUBLIC_SUPABASE_URL'), requiredEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function listAllUsers(admin: SupabaseClient) {
  const users: AuthUser[] = [];
  let page = 1;

  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`Failed to list auth users: ${error.message}`);
    users.push(...(data.users as AuthUser[]));
    if (data.users.length < 200) break;
    page += 1;
  }

  return users;
}

export async function findUserByEmail(admin: SupabaseClient, email: string) {
  const normalizedEmail = email.toLowerCase();
  const users = await listAllUsers(admin);
  return users.find((user) => user.email?.toLowerCase() === normalizedEmail) ?? null;
}

async function ensureOwnerUser(admin: SupabaseClient) {
  const existing = await findUserByEmail(admin, E2E_OWNER_EMAIL);
  if (existing) return existing;

  const { data, error } = await admin.auth.admin.createUser({
    email: E2E_OWNER_EMAIL,
    password: E2E_OWNER_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: 'E2E Owner' },
  });

  if (error || !data.user) {
    throw new Error(`Failed to create owner auth user: ${error?.message ?? 'no user returned'}`);
  }

  return data.user as AuthUser;
}

export async function ensureLocalAuthUser(
  admin: SupabaseClient,
  input: { email: string; password: string; fullName: string },
) {
  const existing = await findUserByEmail(admin, input.email);
  if (existing) return existing;

  const { data, error } = await admin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: input.fullName },
  });

  if (error || !data.user) {
    throw new Error(`Failed to create auth user ${input.email}: ${error?.message ?? 'no user returned'}`);
  }

  return data.user as AuthUser;
}

async function deleteUserByEmail(admin: SupabaseClient, email: string) {
  const existing = await findUserByEmail(admin, email);
  if (!existing) return;

  const { error } = await admin.auth.admin.deleteUser(existing.id);
  if (error) {
    throw new Error(`Failed to delete auth user ${email}: ${error.message}`);
  }
}

async function clearMailpitInbox() {
  const response = await fetch(`${MAILPIT_BASE_URL}/api/v1/messages`, { method: 'DELETE' });
  if (!response.ok) {
    throw new Error(`Failed to clear Mailpit inbox: ${response.status}`);
  }
}

export async function resetLocalAppState(scenario: ResetScenario = 'default') {
  const admin = createAdminClient();
  const owner = await ensureOwnerUser(admin);

  await clearMailpitInbox();
  await deleteUserByEmail(admin, E2E_INVITEE_EMAIL);
  await admin.from('teams').delete().in('id', [E2E_TEAM_ID, E2E_SECOND_TEAM_ID]);

  const { error: teamError } = await admin.from('teams').insert([
    { id: E2E_TEAM_ID, name: 'E2E Team' },
    { id: E2E_SECOND_TEAM_ID, name: 'E2E Secondary Team' },
  ]);
  if (teamError) throw new Error(`Failed to seed team: ${teamError.message}`);

  const { error: memberError } = await admin.from('team_members').insert([
    { team_id: E2E_TEAM_ID, user_id: owner.id, role: 'owner' },
    { team_id: E2E_SECOND_TEAM_ID, user_id: owner.id, role: 'owner' },
  ]);
  if (memberError) throw new Error(`Failed to seed team membership: ${memberError.message}`);

  const { error: mapError } = await admin.from('story_maps').insert({
    id: E2E_STORY_MAP_ID,
    team_id: E2E_TEAM_ID,
    name: 'Platform Core',
    description: 'Seeded story map',
    context_markdown: 'Seeded local Supabase fixture for story map testing.',
  });
  if (mapError) throw new Error(`Failed to seed story map: ${mapError.message}`);

  const { error: secondMapError } = await admin.from('story_maps').insert({
    id: E2E_SECOND_STORY_MAP_ID,
    team_id: E2E_SECOND_TEAM_ID,
    name: 'Secondary Roadmap',
    description: 'Seeded story map for team switching',
    context_markdown: null,
  });
  if (secondMapError) throw new Error(`Failed to seed second story map: ${secondMapError.message}`);

  const { error: activityError } = await admin.from('activities').insert({
    id: E2E_ACTIVITY_ID,
    story_map_id: E2E_STORY_MAP_ID,
    name: 'Finance intake',
    description: 'Initial workflow activity.',
    sort_order: 0,
  });
  if (activityError) throw new Error(`Failed to seed activity: ${activityError.message}`);

  const { error: taskError } = await admin.from('tasks').insert({
    id: E2E_TASK_ID,
    activity_id: E2E_ACTIVITY_ID,
    name: 'Invoice submission',
    description: 'Capture and validate invoice intake.',
    sort_order: 0,
  });
  if (taskError) throw new Error(`Failed to seed task: ${taskError.message}`);

  const { error: releaseError } = await admin.from('releases').insert({
    id: E2E_RELEASE_ID,
    story_map_id: E2E_STORY_MAP_ID,
    name: 'Release 1',
    description: 'Initial release',
    context_markdown: null,
    sort_order: 0,
  });
  if (releaseError) throw new Error(`Failed to seed release: ${releaseError.message}`);

  const { error: storyError } = await admin.from('stories').insert({
    id: E2E_STORY_ID,
    task_id: E2E_TASK_ID,
    release_id: E2E_RELEASE_ID,
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
  });
  if (storyError) throw new Error(`Failed to seed story: ${storyError.message}`);

  const { error: flowError } = await admin.from('process_flows').insert({
    id: E2E_PROCESS_FLOW_ID,
    team_id: E2E_TEAM_ID,
    name: 'Accounts Payable',
    description: 'Invoice intake and approval flow',
    context_markdown: 'Seeded local Supabase fixture for process flow testing.',
    viewport: null,
    schema_version: 1,
  });
  if (flowError) throw new Error(`Failed to seed process flow: ${flowError.message}`);

  const { error: nodesError } = await admin.from('process_flow_nodes').insert([
    {
      id: E2E_NODE_RECEIVE_ID,
      process_flow_id: E2E_PROCESS_FLOW_ID,
      type: 'step',
      position_x: 120,
      position_y: 140,
      width: null,
      height: null,
      data: { label: 'Receive invoice', owner_role: 'Operations' },
    },
    {
      id: E2E_NODE_APPROVED_ID,
      process_flow_id: E2E_PROCESS_FLOW_ID,
      type: 'decision',
      position_x: 420,
      position_y: 140,
      width: null,
      height: null,
      data: { label: 'Approved?', owner_role: 'Finance' },
    },
    ...(scenario === 'malformed'
      ? [
          {
            id: '20000000-0000-4000-8000-000000000041',
            process_flow_id: E2E_PROCESS_FLOW_ID,
            type: 'step',
            position_x: 0,
            position_y: 0,
            width: null,
            height: null,
            data: { label: '' },
          },
        ]
      : []),
  ]);
  if (nodesError) throw new Error(`Failed to seed process flow nodes: ${nodesError.message}`);

  const { error: edgeError } = await admin.from('process_flow_edges').insert({
    id: E2E_EDGE_REVIEW_ID,
    process_flow_id: E2E_PROCESS_FLOW_ID,
    type: 'flow',
    source_node_id: E2E_NODE_RECEIVE_ID,
    target_node_id: E2E_NODE_APPROVED_ID,
    data: { label: 'Review' },
  });
  if (edgeError) throw new Error(`Failed to seed process flow edge: ${edgeError.message}`);
}
