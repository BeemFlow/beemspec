import { LinearClient } from '@linear/sdk';
import { normalize } from '@/lib/strings';

interface LinearLabelNode {
  id: string;
  name: string;
}

interface LinearIssueLabelSnapshot {
  id: string;
  labels: { nodes: LinearLabelNode[] };
}

interface LinearLabelPage {
  nodes?: Array<{ id?: string | null; name?: string | null } | null> | null;
  pageInfo?: { hasNextPage?: boolean | null } | null;
  fetchNext?: () => Promise<LinearLabelPage>;
}

async function collectLinearLabels(initial: LinearLabelPage): Promise<LinearLabelNode[]> {
  const labels: LinearLabelNode[] = [];
  let page: LinearLabelPage | null = initial;

  while (page) {
    for (const label of page.nodes ?? []) {
      if (typeof label?.id === 'string' && typeof label.name === 'string' && label.id && label.name) {
        labels.push({ id: label.id, name: label.name });
      }
    }

    if (!page.pageInfo?.hasNextPage || !page.fetchNext) break;
    page = await page.fetchNext();
  }

  return labels;
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

async function fetchIssueLabels(client: LinearClient, issueId: string): Promise<LinearIssueLabelSnapshot | null> {
  const issue = await client.issue(issueId);
  if (!issue?.id) return null;

  const labels = await collectLinearLabels((await issue.labels({ first: 100 } as never)) as LinearLabelPage);
  return {
    id: issue.id,
    labels: {
      nodes: labels,
    },
  };
}

async function findOrCreateLabelId(client: LinearClient, teamId: string, labelName: string): Promise<string> {
  const team = await client.team(teamId);
  if (!team?.id) throw new Error('Linear team not found');

  const labels = await collectLinearLabels((await team.labels({ first: 100 } as never)) as LinearLabelPage);
  const existing = labels.find((label) => sameLabelName(label.name, labelName));
  if (typeof existing?.id === 'string') return existing.id;

  const created = await client.createIssueLabel({ teamId, name: labelName });
  const createdLabel = created.issueLabel ? await created.issueLabel : null;
  const id = createdLabel?.id;
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

  const client = new LinearClient({ accessToken: input.authToken });

  const issue = await fetchIssueLabels(client, input.issueId);
  if (!issue) return;

  const existing = issue.labels.nodes;
  if (existing.some((label) => sameLabelName(label.name, labelName))) return;

  const labelId = await findOrCreateLabelId(client, input.teamId, labelName);
  const labelIds = [...new Set([...existing.map((label) => label.id), labelId])];

  await client.updateIssue(input.issueId, { labelIds } as never);
}
