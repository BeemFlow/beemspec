# BeemSpec Process Flow Domain and MCP Spec

## Objective

Define the first modular implementation slice for `Process Flow` so it fits the existing BeemSpec architecture:

- shared headless domain module for schemas and types
- shared service layer for domain logic
- thin REST API routes for the editor
- thin MCP tools for agents

This spec is intentionally conservative. It prioritizes a clean v1 over a broad surface area.

## Design Rules

- Keep domain logic out of route handlers and MCP handlers.
- Keep the shared domain module headless and reusable.
- Keep the MCP surface small and predictable.
- Prefer batch mutations for editor practicality.
- Prefer one canonical read shape unless a narrower one is clearly needed.
- Do not model optional future concepts until they are validated.

## Domain Module Shape

Keep the model in the application domain tree:

```text
src/domain/process-flow/
  index.ts
  types.ts
  schemas.ts
```

This mirrors the modular pattern in `src/domain/story-map`.

## Domain Module Responsibility

`src/domain/process-flow` should own:

- TypeScript domain types
- Zod schemas for validation
- inferred input/output types derived from schemas
- shared primitives used by API, MCP, and services

`src/domain/process-flow` should not own:

- database access
- Supabase calls
- API route logic
- MCP tool registration
- React components
- editor-specific state management

The root application owns dependencies. The domain module has no package manifest and no React dependency.

## `types.ts`

Keep the first type layer simple and stable.

### Core types

```ts
export interface ProcessFlow {
  id: string;
  team_id: string;
  name: string;
  description?: string | null;
  context_markdown?: string | null;
  viewport?: ProcessFlowViewport | null;
  schema_version: 1;
}

export interface ProcessFlowViewport {
  x: number;
  y: number;
  zoom: number;
}

export type ProcessFlowNodeType =
  | 'step'
  | 'decision'
  | 'subprocess'
  | 'actor'
  | 'system'
  | 'note';

export type ProcessFlowEdgeType =
  | 'flow'
  | 'handoff'
  | 'exception'
  | 'dependency';
```

### Node and edge data

```ts
export interface ProcessFlowNodePosition {
  x: number;
  y: number;
}

export interface ProcessFlowNodeSize {
  width?: number;
  height?: number;
}

export interface ProcessFlowNodeData {
  label: string;
  owner_role?: string | null;
  systems?: string[];
  inputs?: string[];
  outputs?: string[];
  pain_points?: string | null;
  notes?: string | null;
  automation_opportunity?: string | null;
}

export interface ProcessFlowNode {
  id: string;
  process_flow_id: string;
  type: ProcessFlowNodeType;
  position: ProcessFlowNodePosition;
  size?: ProcessFlowNodeSize | null;
  data: ProcessFlowNodeData;
}

export interface ProcessFlowEdgeData {
  label?: string | null;
}

export interface ProcessFlowEdge {
  id: string;
  process_flow_id: string;
  type: ProcessFlowEdgeType;
  source_node_id: string;
  target_node_id: string;
  data?: ProcessFlowEdgeData | null;
}
```

### Joined read type

```ts
export interface ProcessFlowFull extends ProcessFlow {
  nodes: ProcessFlowNode[];
  edges: ProcessFlowEdge[];
}
```

### Type design notes

- Keep `owner_role` as a string in v1 instead of introducing a separate roles table.
- Keep `systems`, `inputs`, and `outputs` as string arrays in v1.
- Keep node data flexible enough to support workshops, but not so open-ended that validation becomes meaningless.
- Do not add lane/group/container semantics to the kernel yet unless the editor proves they are necessary.

## `schemas.ts`

Follow the `src/domain/story-map` style:

- shared primitives at the top
- base schemas for entities
- create/update schemas derived from base schemas
- inferred types exported at the bottom

### Shared primitives

```ts
const uuid = z.string().uuid();
const nullableString = z.string().min(1).nullable();
const name = z.string().min(1, 'Required').max(200);
const nonEmptyLabel = z.string().min(1, 'Required').max(200);
```

Reuse the same `atLeastOneField` helper pattern from `src/domain/story-map/schemas.ts`.

### Recommended schemas

```ts
export const processFlowViewportSchema = z.object({
  x: z.number(),
  y: z.number(),
  zoom: z.number().positive(),
}).strict();

export const processFlowNodeTypeSchema = z.enum([
  'step',
  'decision',
  'subprocess',
  'actor',
  'system',
  'note',
]);

export const processFlowEdgeTypeSchema = z.enum([
  'flow',
  'handoff',
  'exception',
  'dependency',
]);
```

```ts
export const processFlowNodeDataSchema = z.object({
  label: nonEmptyLabel,
  owner_role: nullableString.optional(),
  systems: z.array(z.string().min(1)).optional(),
  inputs: z.array(z.string().min(1)).optional(),
  outputs: z.array(z.string().min(1)).optional(),
  pain_points: nullableString.optional(),
  notes: nullableString.optional(),
  automation_opportunity: nullableString.optional(),
}).strict();

export const processFlowEdgeDataSchema = z.object({
  label: nullableString.optional(),
}).strict();
```

```ts
export const processFlowBase = z.object({
  team_id: uuid,
  name,
  description: nullableString,
  context_markdown: nullableString,
  viewport: processFlowViewportSchema.nullable().optional(),
}).strict();

export const createProcessFlowSchema = processFlowBase.partial({
  description: true,
  context_markdown: true,
  viewport: true,
});

export const updateProcessFlowSchema = processFlowBase
  .omit({ team_id: true })
  .partial()
  .strict()
  .refine(atLeastOneField, atLeastOneFieldMessage);
```

```ts
export const processFlowNodeBase = z.object({
  process_flow_id: uuid,
  type: processFlowNodeTypeSchema,
  position: z.object({ x: z.number(), y: z.number() }).strict(),
  size: z.object({ width: z.number().positive().optional(), height: z.number().positive().optional() }).strict().nullable().optional(),
  data: processFlowNodeDataSchema,
}).strict();

export const createProcessFlowNodeSchema = processFlowNodeBase;

export const updateProcessFlowNodeSchema = processFlowNodeBase
  .omit({ process_flow_id: true })
  .partial()
  .strict()
  .refine(atLeastOneField, atLeastOneFieldMessage);
```

```ts
export const processFlowEdgeBase = z.object({
  process_flow_id: uuid,
  type: processFlowEdgeTypeSchema,
  source_node_id: uuid,
  target_node_id: uuid,
  data: processFlowEdgeDataSchema.nullable().optional(),
}).strict();

export const createProcessFlowEdgeSchema = processFlowEdgeBase;

export const updateProcessFlowEdgeSchema = processFlowEdgeBase
  .omit({ process_flow_id: true, source_node_id: true, target_node_id: true })
  .partial()
  .strict()
  .refine(atLeastOneField, atLeastOneFieldMessage);
```

### Batch mutation schemas

Use explicit batch schemas for practical editor mutations:

```ts
export const processFlowNodeMutationSchema = z.object({
  id: uuid.optional(),
  action: z.enum(['create', 'update', 'delete']),
  payload: z.unknown().optional(),
}).strict();

export const batchMutateProcessFlowNodesSchema = z.object({
  process_flow_id: uuid,
  mutations: z.array(processFlowNodeMutationSchema).min(1),
}).strict();
```

```ts
export const processFlowEdgeMutationSchema = z.object({
  id: uuid.optional(),
  action: z.enum(['create', 'update', 'delete']),
  payload: z.unknown().optional(),
}).strict();

export const batchMutateProcessFlowEdgesSchema = z.object({
  process_flow_id: uuid,
  mutations: z.array(processFlowEdgeMutationSchema).min(1),
}).strict();
```

Keep the batch transport small and explicit. Do not introduce a generic patch language in v1.

### Layout and validation schemas

```ts
export const processFlowAutolayoutSchema = z.object({
  process_flow_id: uuid,
}).strict();

export const processFlowValidationRequestSchema = z.object({
  process_flow_id: uuid,
}).strict();
```

### Exported inferred types

At minimum:

- `CreateProcessFlow`
- `UpdateProcessFlow`
- `CreateProcessFlowNode`
- `UpdateProcessFlowNode`
- `CreateProcessFlowEdge`
- `UpdateProcessFlowEdge`
- `BatchMutateProcessFlowNodes`
- `BatchMutateProcessFlowEdges`
- `ProcessFlowAutolayoutRequest`
- `ProcessFlowValidationRequest`

## `index.ts`

Keep exports explicit and boring.

Recommended shape:

```ts
export {
  batchMutateProcessFlowEdgesSchema,
  batchMutateProcessFlowNodesSchema,
  createProcessFlowEdgeSchema,
  createProcessFlowNodeSchema,
  createProcessFlowSchema,
  processFlowAutolayoutSchema,
  processFlowBase,
  processFlowEdgeBase,
  processFlowEdgeDataSchema,
  processFlowEdgeTypeSchema,
  processFlowNodeBase,
  processFlowNodeDataSchema,
  processFlowNodeTypeSchema,
  processFlowValidationRequestSchema,
  processFlowViewportSchema,
  updateProcessFlowEdgeSchema,
  updateProcessFlowNodeSchema,
  updateProcessFlowSchema,
} from './schemas';

export type {
  BatchMutateProcessFlowEdges,
  BatchMutateProcessFlowNodes,
  CreateProcessFlow,
  CreateProcessFlowEdge,
  CreateProcessFlowNode,
  ProcessFlowAutolayoutRequest,
  ProcessFlowValidationRequest,
  UpdateProcessFlow,
  UpdateProcessFlowEdge,
  UpdateProcessFlowNode,
} from './schemas';

export type {
  ProcessFlow,
  ProcessFlowEdge,
  ProcessFlowEdgeData,
  ProcessFlowEdgeType,
  ProcessFlowFull,
  ProcessFlowNode,
  ProcessFlowNodeData,
  ProcessFlowNodePosition,
  ProcessFlowNodeSize,
  ProcessFlowNodeType,
  ProcessFlowViewport,
} from './types';
```

## Service Layer

Create:

```text
src/processflow/service.ts
```

This file should mirror the shape of `src/storymap/service.ts`.

### Responsibilities

- list flows by team
- load full flow graph for the editor
- load MCP-friendly flow context
- create/update/delete flows
- create/update/delete nodes
- create/update/delete edges
- batch mutate nodes
- batch mutate edges
- persist viewport
- run deterministic validation
- run auto-layout orchestration

### Non-responsibilities

- registering MCP tools
- formatting HTTP responses
- formatting MCP responses
- choosing how the agent should reason

### Read functions

Prefer two read functions at most in v1:

```ts
getProcessFlowGraph(...)
getProcessFlowMcpContext(...)
```

That mirrors the existing story map split between full editor reads and lighter MCP reads.

## REST API Surface

Keep routes thin and aligned to editor needs.

### Routes

```text
GET    /api/process-flows
POST   /api/process-flows

GET    /api/process-flows/[id]
PUT    /api/process-flows/[id]
DELETE /api/process-flows/[id]

POST   /api/process-flows/[id]/nodes
PUT    /api/process-flows/[id]/nodes

POST   /api/process-flows/[id]/edges
PUT    /api/process-flows/[id]/edges

POST   /api/process-flows/[id]/layout
GET    /api/process-flows/[id]/validation
```

### REST route intent

- `POST /nodes` and `POST /edges` may create a single entity.
- `PUT /nodes` and `PUT /edges` should support explicit batch mutation payloads.
- Do not create lots of tiny route variants until the editor proves they are needed.

## MCP Tool Contract Spec

Keep the MCP tool set intentionally small.

### Read-first guide

- `processflow_workflow_guide`

Purpose:

- teach ontology
- teach safe vs unsafe inference
- teach tool order
- reduce redundant reads

### Core read tools

- `processflow_list`
- `processflow_get`
- `processflow_validation_get`

### Core write tools

- `processflow_create`
- `processflow_update`
- `processflow_delete`
- `processflow_node_create`
- `processflow_node_update`
- `processflow_node_delete`
- `processflow_edge_create`
- `processflow_edge_update`
- `processflow_edge_delete`

### Why not expose batch MCP tools in v1

For the editor, batch mutation is practical.

For agents, smaller explicit tools are usually better because they:

- reduce payload complexity
- improve error recovery
- make intent clearer in transcripts and logs
- mirror the story map MCP style more closely

If later the agent needs large structural edits often, add:

- `processflow_nodes_batch_mutate`
- `processflow_edges_batch_mutate`

But do not start there.

## MCP Tool Input Guidelines

### `processflow_create`

Should accept:

- `team_id`
- `name`
- optional `description`
- optional `context_markdown`

### `processflow_get`

Should accept:

- `process_flow_id`
- optional `process_flow_name`
- optional `team_id` for disambiguation

This mirrors the `storymap_get` pattern and keeps the user-facing workflow flexible.

### `processflow_node_create`

Should accept:

- `process_flow_id`
- `type`
- `position`
- `data`

### `processflow_node_update`

Should accept:

- `node_id`
- partial changes

### `processflow_edge_create`

Should accept:

- `process_flow_id`
- `type`
- `source_node_id`
- `target_node_id`
- optional `data`

## Deterministic Validation Contract

Validation should be backend-owned and transport-neutral.

### Suggested warnings

- disconnected nodes
- decisions with fewer than two outgoing paths
- decision edges missing labels where labels are expected
- self-referential edges
- duplicate labels in the same flow
- handoff edges attached to nodes with no ownership context
- empty note nodes

### Return shape

Use a simple structure such as:

```ts
type ProcessFlowValidationResult = {
  warnings: Array<{
    code: string;
    message: string;
    node_ids?: string[];
    edge_ids?: string[];
  }>;
};
```

Keep it explainable and stable for both editor and agent use.

## Clean Modularity Checklist

Before implementation, verify:

- `src/domain/process-flow` has no Supabase imports
- `src/domain/process-flow` has no Next.js imports
- `src/domain/process-flow` has no MCP imports
- `src/processflow/service.ts` owns all mutation rules
- API routes call service functions only
- MCP tools call service functions only
- API and MCP share the same schema package
- transport layers shape responses but do not invent domain behavior

## Recommended First Build Order

1. Create `src/domain/process-flow` with `types.ts`, `schemas.ts`, `index.ts`
2. Create DB schema and `src/processflow/service.ts`
3. Add REST routes for process flow CRUD and validation
4. Add MCP tools and `processflow_workflow_guide`
5. Add React Flow editor wired to the REST API
6. Add ELK auto-layout integration

## Recommendation

Build the first process flow implementation as a clean sibling to story maps, not as a variation inside story maps.

Keep the modular boundaries sharp:

- package = types and validation
- service = business logic
- API = editor transport
- MCP = agent transport
- UI = editor presentation

That keeps the design simple, testable, and aligned with the way BeemSpec is already structured.
