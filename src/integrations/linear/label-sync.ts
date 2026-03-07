import { normalize } from '@/lib/strings';

const LINEAR_GRAPHQL_URL = 'https://api.linear.app/graphql';

interface LinearLabelNode {
  id: string;
  name: string;
}

interface LinearIssueLabelSnapshot {
  id: string;
  labels: { nodes: LinearLabelNode[] };
}

function normalizeLabelName(value: string | null | undefined): string | null {
  return normalize(value);
}

function sameLabelName(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = normalizeLabelName(a);
  const right = normalizeLabelName(b);
  if (!left || !right) return false;
  return left.toLowerCase() === right.toLowerCase();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null;
  return value as Record<string, unknown>;
}

function getString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function linearPayloadHasLabel(payload: Record<string, unknown> | null, labelName: string): boolean {
  if (!payload) return false;
  const labels = asRecord(payload.labels);
  const nodesRaw = labels?.nodes;
  if (!Array.isArray(nodesRaw)) return false;

  return nodesRaw.some((node) => {
    const record = asRecord(node);
    return sameLabelName(getString(record?.name), labelName);
  });
}

export function getLinearIssueLabelNames(payload: Record<string, unknown> | null): string[] {
  if (!payload) return [];
  const labelsRaw = payload.labels;
  const nodesRaw = Array.isArray(labelsRaw) ? labelsRaw : asRecord(labelsRaw)?.nodes;
  if (!Array.isArray(nodesRaw)) return [];

  const names = nodesRaw
    .map((node) => asRecord(node))
    .map((record) => getString(record?.name))
    .filter((name): name is string => Boolean(name));

  return [...new Set(names)];
}

export function getLinearIssueTeamIdFromPayload(payload: Record<string, unknown> | null): string | null {
  if (!payload) return null;
  const direct = getString(payload.teamId);
  if (direct) return direct;
  const directTeam = getString(payload.team);
  if (directTeam) return directTeam;
  const team = asRecord(payload.team);
  return getString(team?.id);
}

export function getLinearIssueProjectIdFromPayload(payload: Record<string, unknown> | null): string | null {
  if (!payload) return null;
  const direct = getString(payload.projectId);
  if (direct) return direct;
  const directProject = getString(payload.project);
  if (directProject) return directProject;
  const project = asRecord(payload.project);
  return getString(project?.id);
}

async function linearGraphql<T>(authToken: string, query: string, variables: Record<string, unknown>): Promise<T> {
  const response = await fetch(LINEAR_GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: authToken.startsWith('lin_api_') ? authToken : `Bearer ${authToken}`,
    },
    body: JSON.stringify({ query, variables }),
    cache: 'no-store',
  });

  const payload = (await response.json()) as { data?: T; errors?: Array<{ message?: string }> };
  if (!response.ok || payload.errors?.length || !payload.data) {
    const message = payload.errors?.[0]?.message ?? `Linear GraphQL request failed (${response.status})`;
    throw new Error(message);
  }

  return payload.data;
}

async function fetchIssueLabels(authToken: string, issueId: string): Promise<LinearIssueLabelSnapshot | null> {
  const data = await linearGraphql<{
    issue: { id: string; labels: { nodes: Array<{ id: string; name: string }> } } | null;
  }>(
    authToken,
    `query IssueLabels($issueId: String!) {
      issue(id: $issueId) {
        id
        labels {
          nodes {
            id
            name
          }
        }
      }
    }`,
    { issueId },
  );

  if (!data.issue) return null;
  return {
    id: data.issue.id,
    labels: { nodes: data.issue.labels?.nodes ?? [] },
  };
}

async function findOrCreateLabelId(authToken: string, teamId: string, labelName: string): Promise<string> {
  const labelsData = await linearGraphql<{
    team: { labels: { nodes: Array<{ id: string; name: string }> } } | null;
  }>(
    authToken,
    `query TeamLabels($teamId: String!) {
      team(id: $teamId) {
        labels {
          nodes {
            id
            name
          }
        }
      }
    }`,
    { teamId },
  );

  const existing = labelsData.team?.labels?.nodes?.find((label) => sameLabelName(label.name, labelName));
  if (existing?.id) return existing.id;

  const created = await linearGraphql<{
    issueLabelCreate: { success: boolean; issueLabel: { id: string } | null };
  }>(
    authToken,
    `mutation CreateIssueLabel($teamId: String!, $name: String!) {
      issueLabelCreate(input: { teamId: $teamId, name: $name }) {
        success
        issueLabel {
          id
        }
      }
    }`,
    { teamId, name: labelName },
  );

  const id = created.issueLabelCreate.issueLabel?.id;
  if (!id) throw new Error('Failed to create Linear issue label');
  return id;
}

export async function ensureLinearIssueHasLabel(input: {
  authToken: string;
  issueId: string;
  teamId: string;
  labelName: string;
}): Promise<void> {
  const labelName = normalizeLabelName(input.labelName);
  if (!labelName) return;

  const issue = await fetchIssueLabels(input.authToken, input.issueId);
  if (!issue) return;

  const existing = issue.labels.nodes;
  if (existing.some((label) => sameLabelName(label.name, labelName))) return;

  const labelId = await findOrCreateLabelId(input.authToken, input.teamId, labelName);
  const labelIds = [...new Set([...existing.map((label) => label.id), labelId])];

  await linearGraphql(
    input.authToken,
    `mutation ApplyIssueLabels($issueId: String!, $labelIds: [String!]!) {
      issueUpdate(id: $issueId, input: { labelIds: $labelIds }) {
        success
      }
    }`,
    { issueId: input.issueId, labelIds },
  );
}
