import type { IssueUpsertInput, StoryForSync, SyncTarget } from '@beemspec/sync';
import { toString as mdastToString } from 'mdast-util-to-string';
import remarkParse from 'remark-parse';
import { unified } from 'unified';

type ParsedFieldKey = keyof ParsedLinearStoryFields;

interface SectionDefinition {
  field: ParsedFieldKey;
  title: string;
  aliases?: string[];
}

interface MarkdownNodePosition {
  start?: { offset?: number };
  end?: { offset?: number };
}

interface MarkdownNodeLike {
  type?: string;
  depth?: number;
  children?: unknown[];
  position?: MarkdownNodePosition;
}

interface ParsedLinearDescription {
  fields: ParsedLinearStoryFields;
  unknownBlocks: string[];
}

const OWNED_SECTIONS: SectionDefinition[] = [
  { field: 'user_story', title: 'User Story', aliases: ['Requirements'] },
  { field: 'acceptance_criteria', title: 'Acceptance Criteria' },
  { field: 'figma_link', title: 'Figma' },
  { field: 'edge_cases', title: 'Edge Cases' },
  { field: 'technical_guidelines', title: 'Technical Guidelines' },
];

const SECTION_BY_HEADING = new Map<string, SectionDefinition>();
for (const sectionDef of OWNED_SECTIONS) {
  SECTION_BY_HEADING.set(normalizeHeading(sectionDef.title), sectionDef);
  for (const alias of sectionDef.aliases ?? []) {
    SECTION_BY_HEADING.set(normalizeHeading(alias), sectionDef);
  }
}

function section(title: string, body: string | null | undefined): string | null {
  if (!body) return null;
  return `## ${title}\n${body}`;
}

function normalizeHeading(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function trimBlock(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getOffset(value: number | undefined, fallback: number): number {
  return typeof value === 'number' ? value : fallback;
}

function getHeadingNodes(description: string): Array<{ index: number; node: MarkdownNodeLike; title: string }> {
  const tree = unified().use(remarkParse).parse(description) as { children?: MarkdownNodeLike[] };
  const children = Array.isArray(tree.children) ? tree.children : [];

  return children
    .map((node, index) => ({ index, node, title: node.type === 'heading' ? mdastToString(node as never).trim() : '' }))
    .filter(({ node, title }) => node.type === 'heading' && title.length > 0);
}

function parseLinearDescription(description: string | null): ParsedLinearDescription {
  if (!description) {
    return { fields: {}, unknownBlocks: [] };
  }

  const headingNodes = getHeadingNodes(description);
  const fields: ParsedLinearStoryFields = {};
  const unknownBlocks: string[] = [];

  if (headingNodes.length === 0) {
    return { fields, unknownBlocks: trimBlock(description) ? [description.trim()] : [] };
  }

  const firstHeadingStart = getOffset(headingNodes[0]?.node.position?.start?.offset, 0);
  const preamble = trimBlock(description.slice(0, firstHeadingStart));
  if (preamble) unknownBlocks.push(preamble);

  for (let index = 0; index < headingNodes.length; index += 1) {
    const current = headingNodes[index];
    const next = headingNodes[index + 1];
    const rawTitle = current.title;
    const normalizedTitle = normalizeHeading(rawTitle);
    const sectionDef = SECTION_BY_HEADING.get(normalizedTitle);
    const sectionStart = getOffset(current.node.position?.start?.offset, 0);
    const contentStart = getOffset(current.node.position?.end?.offset, sectionStart);
    const nextStart = getOffset(next?.node.position?.start?.offset, description.length);
    const content = trimBlock(description.slice(contentStart, nextStart));

    if (!sectionDef) {
      const unknownBlock = trimBlock(description.slice(sectionStart, nextStart));
      if (unknownBlock) unknownBlocks.push(unknownBlock);
      continue;
    }

    if (sectionDef.field === 'user_story') {
      const shouldOverwrite = normalizedTitle === normalizeHeading(sectionDef.title) || fields.user_story === undefined;
      if (shouldOverwrite) {
        fields.user_story = content ?? undefined;
      }
      continue;
    }

    if (sectionDef.field === 'figma_link') {
      if (content !== null) fields.figma_link = normalizeFigmaLink(content);
      continue;
    }

    fields[sectionDef.field] = content ?? undefined;
  }

  return { fields, unknownBlocks };
}

function normalizeFigmaLink(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const markdownLink = trimmed.match(/^\[[^\]]*\]\((?:<)?([^)>\s]+)(?:>)?\)$/);
  if (markdownLink?.[1]) return markdownLink[1].trim();

  const directUrl = trimmed.match(/^<?(https?:\/\/\S+?)>?$/i);
  if (directUrl?.[1]) return directUrl[1].trim();

  const firstUrl = trimmed.match(/https?:\/\/\S+/i);
  if (firstUrl?.[0]) return firstUrl[0].replace(/[)>.,;]+$/, '');

  return null;
}

export interface ParsedLinearStoryFields {
  user_story?: string;
  acceptance_criteria?: string;
  figma_link?: string | null;
  edge_cases?: string | null;
  technical_guidelines?: string | null;
}

export function buildLinearDescription(
  story: StoryForSync,
  options: { preserveFromDescription?: string | null } = {},
): string {
  const { content } = story;
  const parts = [
    section('User Story', content.user_story),
    section('Acceptance Criteria', content.acceptance_criteria),
    section('Figma', content.figma_link),
    section('Edge Cases', content.edge_cases),
    section('Technical Guidelines', content.technical_guidelines),
  ].filter((value): value is string => Boolean(value));

  const preservedBlocks = parseLinearDescription(options.preserveFromDescription ?? null).unknownBlocks;
  return [...parts, ...preservedBlocks].join('\n\n');
}

export function parseLinearDescriptionToStoryFields(description: string | null): ParsedLinearStoryFields {
  return parseLinearDescription(description).fields;
}

export function mapStoryToLinearIssueInput(
  story: StoryForSync,
  target: SyncTarget,
  options: { preserveFromDescription?: string | null } = {},
): IssueUpsertInput {
  return {
    id: story.id,
    title: story.title,
    description: buildLinearDescription(story, options),
    teamId: target.teamId,
    projectId: target.projectId,
  };
}
