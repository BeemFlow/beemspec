# BeemSpec Process Flow Architecture Plan

## Goal

Extend BeemSpec with a first-class `process flow` capability that complements story maps without replacing them.

BeemSpec should remain a context engine and deterministic planning surface, while external agents do the semantic reasoning needed to translate user input, transcripts, and workshop notes into structured process flows and optimization plans.

## Naming Decision

### Product language

- Use **Process Flow** as the primary product term.
- Rationale:
  - aligns with the BeemFlow brand direction
  - communicates movement, handoffs, and branching more clearly than "process map"
  - pairs cleanly with existing "story map" language without implying the same structure

### Internal and API naming

- Use `processflow` as the canonical no-separator identifier for MCP tool names.
- Use `process_flows` for database or storage identifiers where snake case is preferred.
- Use `ProcessFlow` in TypeScript types.

Examples:

- MCP tool prefix: `processflow_*`
- DB table: `process_flows`
- TypeScript type: `ProcessFlow`

### Story map naming cleanup

Current story map MCP naming is mostly prefixed, but not fully consistent because tools like `release_get` and `story_context_get` are unprefixed.

Recommendation:

- Going forward, require a clear bounded-context prefix for all new MCP tools.
- For story maps, prefer eventual aliases such as:
  - `storymap_release_get`
  - `storymap_story_context_get`
- Keep existing tool names for backward compatibility during a migration period.
- For process flow, start clean from day one with the `processflow_` prefix on every tool.

## Product Direction

BeemSpec should support multiple structured planning views over related but distinct models:

- **Story Map**: decomposition, slicing, release planning, implementation context
- **Process Flow**: operational flow modeling, handoffs, branching, systems, roles, automation opportunities
- **Roadmap**: stakeholder alignment and sequencing across story maps and process flows

BeemSpec should not force one model to do every job.

Instead:

- story maps remain best for planning and slicing change
- process flows become best for representing operational reality and redesign
- roadmap becomes best for cross-map alignment and sequencing

## Core Principle

Do not put LLM logic in the BeemSpec backend.

BeemSpec owns:

- structured storage
- deterministic validation
- deterministic heuristics
- domain-specific MCP tools
- workflow guide tools that teach agents how to use the system correctly

External agents own:

- transcript interpretation
- process extraction from messy language
- ambiguity handling and clarification strategy
- optimization ideas
- automation design proposals
- n8n workflow brainstorming and generation

This mirrors the existing story map philosophy.

## Why Process Flow Is A Separate Model

Story maps and process flows overlap, but they are not the same thing.

### Story map strengths

- narrative sequence
- decomposition into activities, tasks, and stories
- release slicing
- implementation handoff to coding agents

### Process flow strengths

- explicit handoffs
- branching and decision points
- loops and exception paths
- actor and system participation
- operational modeling
- automation opportunity analysis

### Conclusion

Process flow should be decoupled from story map at the domain-model level, while sharing product principles, UI conventions, and MCP patterns.

Do not try to force process flow semantics into the story map schema.

## Technical Stack Decision

### Chosen packages

- **Primary editor**: `@xyflow/react`
- **Auto-layout engine**: `elkjs`

### Why this stack

#### `@xyflow/react`

Use React Flow as the primary process flow editor because it is the strongest fit for the current BeemSpec stack:

- Next.js
- React
- TypeScript
- custom domain-specific node and edge types
- agent-friendly JSON serialization

It provides:

- interactive node/edge editing
- custom nodes and edges
- grouping and viewport controls
- save/restore-friendly data structures
- a React-native extension model

#### `elkjs`

Use ELK as the layout engine because process flows are directed graphs with meaningful branching and handoffs.

ELK is the right choice for:

- layered directed graphs
- actor/system-oriented flows
- decision trees and branching paths
- larger process diagrams that need readable auto-layout

### Explicit non-decision

- Do **not** add Dagre initially.
- Reason: it is useful as a simpler fallback, but it adds another layout concept without being necessary for the first version.
- If later performance or instant-preview concerns justify it, Dagre can be added as an optional quick-layout helper.

### Optional future interoperability

- Treat BPMN support as an optional future import/export layer, not the native authoring model.
- If needed later:
  - import BPMN into BeemSpec process flow JSON
  - export BeemSpec process flow JSON into BPMN-compatible artifacts

## Domain Model

BeemSpec should own its own canonical process flow schema.

Do not let the graph library define the domain model.

### Top-level shape

```ts
type ProcessFlow = {
  id: string;
  team_id: string;
  name: string;
  description?: string | null;
  context_markdown?: string | null;
  nodes: ProcessFlowNode[];
  edges: ProcessFlowEdge[];
  viewport?: {
    x: number;
    y: number;
    zoom: number;
  } | null;
  schema_version: 1;
};
```



### Node kinds

Start with a deliberately small set:

- `step`
- `decision`
- `subprocess`
- `actor`
- `system`
- `note`

Possible future node kinds:

- `datastore`
- `document`
- `risk`
- `metric`
- `automation`

### Edge kinds

Start with:

- `flow`
- `handoff`
- `exception`
- `dependency`

Possible future edge kinds:

- `approval`
- `escalation`
- `async_signal`

### Node data expectations

Node payloads should support operational modeling directly, for example:

- display label
- owner or responsible role
- participating systems
- inputs and outputs
- pain points
- time or effort estimate
- frequency
- automation potential
- notes on ambiguity

These should be stored in a BeemSpec-defined schema rather than improvised in generic text fields.

## Relationship To Story Maps

Process flows and story maps should be separate bounded contexts.

### Shared principles

- same team ownership model
- same app shell and permissions model
- same MCP philosophy
- same agent-first context-engine architecture
- same deterministic validation and warning approach

### Different responsibilities

#### Story maps

- represent product or implementation planning structure
- organize work into activities, tasks, stories, and releases
- serve coding agents with implementation-ready context

#### Process flows

- represent operational flow and redesign opportunities
- capture roles, systems, steps, decisions, and handoffs
- support optimization and automation reasoning
- serve automation agents with flow-level context

### Integration points

Over time, process flows and story maps should be linkable.

Examples:

- a process flow node can link to a story map story that implements an automation
- a roadmap item can reference both a story map release and a process flow improvement area
- process flow nodes can link to implementation stories or epics

## API and MCP Shared Service Architecture

### Principle: no redundant business logic

API routes and MCP tools must share the same business logic layer.

This is already the established pattern for story maps in the codebase:

- `src/storymap/service.ts` contains all domain operations (list, get, create, update, delete, reorder, move)
- API routes in `src/app/api/story-maps/`, `src/app/api/stories/`, `src/app/api/activities/`, etc. are thin HTTP handlers that call service functions
- MCP tools in `src/integrations/mcp/server.ts` are thin MCP handlers that call the same service functions
- Both API and MCP validate against the same shared schema package (`@beemspec/storymap`)

Process flow must follow this same pattern exactly.

### Process flow service layer

```
src/processflow/service.ts          — all domain operations
packages/processflow/src/schemas.ts — shared Zod schemas and types
packages/processflow/src/types.ts   — shared TypeScript types
```

### API routes (frontend-facing transport)

```
src/app/api/process-flows/route.ts          — list, create
src/app/api/process-flows/[id]/route.ts     — get, update, delete
src/app/api/process-flows/[id]/nodes/route.ts   — create node, batch mutate nodes
src/app/api/process-flows/[id]/edges/route.ts   — create edge, batch mutate edges
src/app/api/process-flows/[id]/layout/route.ts  — trigger auto-layout
```

For v1, prefer explicit batch mutation endpoints for nodes and edges rather than a large number of tiny reorder/move endpoints. This keeps the frontend editor practical while still centralizing all business rules in the shared service layer.

### MCP tools (agent-facing transport)

```
processflow_workflow_guide  — read-first guide
processflow_list            — list flows for a team
processflow_get             — load full flow context
processflow_create          — create a new flow
processflow_update          — update flow metadata
processflow_delete          — delete a flow
processflow_node_create     — add a node
processflow_node_update     — update a node
processflow_node_delete     — remove a node
processflow_edge_create     — add an edge
processflow_edge_update     — update an edge
processflow_edge_delete     — remove an edge
processflow_validation_get  — get deterministic warnings
```

### Where slight differences are acceptable

Read models do not need to be identical between API and MCP.

This is already true for story maps:

- API uses `getStoryMapGraph` which returns full DB rows for the frontend editor
- MCP uses `getStoryMapMcpContext` which returns a lighter, agent-optimized projection

The same pattern should apply to process flows:

- API returns editor-friendly payloads (full node/edge data, viewport state, layout metadata)
- MCP returns agent-friendly payloads (structured node/edge summaries, guidance hints, validation warnings)

`processflow_get` should be the main canonical read for both editor hydration and agent reasoning. Add narrower read tools only if they are later proven necessary for performance or workflow clarity.

Both call into the same service layer for mutations.

### What must stay shared

- all mutation logic (create, update, delete, reorder)
- all validation schemas
- all domain types
- all deterministic heuristics and warnings

### What can differ per transport

- read projections and response shaping
- error formatting (HTTP status codes vs MCP error results)
- auth middleware (session cookies vs MCP token)
- guidance/context augmentation (MCP adds workflow guide data, API does not)

## MCP Architecture

Process flow should mirror the story map MCP philosophy closely.

### Guiding principle

The MCP server is not the planner.

The MCP server:

- exposes deterministic tools
- exposes structured data
- exposes workflow guidance
- helps the agent avoid bad modeling behavior

The agent:

- interprets user input
- decides what nodes and edges to create
- asks clarifying questions when necessary
- proposes optimizations and automations

## MCP Tool Naming Strategy

All process flow MCP tools should be prefixed with `processflow_`.

### Read-first guide

- `processflow_workflow_guide`

### Discovery and reads

- `processflow_list`
- `processflow_get`
- `processflow_validation_get`

### Writes

- `processflow_create`
- `processflow_update`
- `processflow_delete`
- `processflow_node_create`
- `processflow_node_update`
- `processflow_node_delete`
- `processflow_edge_create`
- `processflow_edge_update`
- `processflow_edge_delete`

### Optional future tools

- `processflow_story_links_get`
- `processflow_n8n_candidates_get`

## `processflow_workflow_guide`

This tool should be the process-flow equivalent of `storymap_workflow_guide`.

It should instruct agents how to translate unstructured input into a clean process flow.

### Purpose

- guide agents when interpreting transcripts, notes, or direct user input
- teach the ontology and modeling rules
- reduce noisy or inconsistent diagrams
- keep the backend deterministic while improving agent output quality

### Key behaviors the guide should teach

- identify actors, systems, steps, decisions, and handoffs
- prefer modeling the existing process first unless the user explicitly asks for a redesign
- distinguish observed reality from inferred assumptions
- model uncertainty explicitly when evidence is weak
- ask clarifying questions only when ambiguity materially changes the flow
- avoid inventing systems, approvals, or branching that the source material does not support
- use subprocesses when repeated or complex clusters emerge
- keep labels short and operationally meaningful
- capture pain points and automation opportunities without turning the graph into prose soup

### Suggested tool sequence

1. Discover the relevant process flow with `processflow_list` if needed.
2. Load current flow state with `processflow_get` before structural edits.
3. Read `processflow_workflow_guide` before translating notes or transcripts into mutations.
4. Create or update nodes and edges in focused batches.
5. Re-read with `processflow_get` when the structure materially changes.
6. Only after the existing flow is trustworthy, propose optimization or automation opportunities.

## Automation and n8n Direction

The target workflow should be:

1. User provides transcript, notes, or a direct description of a business process.
2. Agent calls `processflow_workflow_guide`.
3. Agent builds or updates the process flow through MCP.
4. Agent analyzes pain points, handoffs, delays, and repetitive steps.
5. Agent identifies candidate automation segments.
6. Agent uses those segments to brainstorm or generate n8n workflow designs.

BeemSpec remains the source of structured context across the whole workflow.

## Validation and Deterministic Heuristics

The backend should own deterministic checks, for example:

- disconnected nodes
- decisions with missing labeled branches
- nodes with no inbound or outbound flow where that is suspicious
- handoff edges with no actor or owner context
- duplicate or near-duplicate node labels in the same region
- overly verbose node labels

These should appear as structured warnings, not as backend-generated product judgments.

## UI Direction

### Editor surface

- build a dedicated process flow canvas using `@xyflow/react`
- use custom node components aligned with BeemSpec visual language
- include a side inspector for structured node fields
- support zoom, pan, minimap, selection, and keyboard deletion

### Editing behavior

- make the graph editor client-only
- persist BeemSpec JSON, not raw editor state blobs
- treat layout metadata as derived but stored
- separate domain data from viewport and presentation data

### First UX target

The first version should optimize for:

- workshop-driven editing
- agent-assisted drafting
- straightforward flow creation and iteration
- easy linking from flow nodes to downstream execution work

## Roadmap Relationship

Roadmap should eventually become the cross-context alignment layer.

It should be able to pull from:

- story map releases
- story map stories
- process flow automation opportunities
- process flow improvement areas

That makes roadmap a portfolio view, not another planning primitive.

## Implementation Phases

### Phase 1: Foundation

- add `process flow` domain concept
- define canonical JSON schema in `@beemspec/processflow`
- add DB tables (`process_flows`, `process_flow_nodes`, `process_flow_edges`)
- add shared service layer at `src/processflow/service.ts`
- add REST API routes at `src/app/api/process-flows/`
- add MCP read/write tools calling the same service layer
- build `processflow_workflow_guide`
- build `processflow_validation_get` with basic deterministic checks

### Phase 2: Editor

- integrate `@xyflow/react`
- implement custom nodes and edges
- implement inspector panel
- implement `elkjs` auto-layout
- persist graph state safely
- wire editor to REST API

### Phase 3: Automation Context

- add structured automation opportunity fields to node data
- link process flow nodes to story map artifacts
- add flow-level agent context for automation candidates
- support downstream n8n-oriented planning prompts and tooling

### Phase 4: Roadmap Integration

- add roadmap entities that can reference multiple source types
- support stakeholder-facing rollups across process flows and story maps

### Future (if validated)

- BPMN import/export

## Recommendation

Proceed with a first-class **Process Flow** capability using:

- `@xyflow/react` for editing
- `elkjs` for layout
- BeemSpec-owned JSON schema as the source of truth
- fully prefixed `processflow_*` MCP tools
- a `processflow_workflow_guide` that teaches external agents how to build trustworthy flows from messy human input

This preserves BeemSpec's core architectural principle:

BeemSpec is the structured planning and context engine.
The external agent does the semantic reasoning.
