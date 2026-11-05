# Mermaid process flow migration

## Target

Each process flow has one canonical Mermaid document on its existing `process_flows` row. The canvas and MCP share the same revision-checked save service. Pele parses the document, ELK places nodes, and React Flow displays and edits the derived graph. Metadata on the same row preserves inspector fields and manual layout.

## Work

- [x] Add a transactional SQL migration that converts existing flows in place. Keep flow IDs, signed share links, node and edge identities, labels, graph order, semantic types, inspector fields, coordinates, dimensions, and viewport. Archive the legacy rows in a protected schema for rollback before removing the live legacy tables and RPCs.
- [x] Build a Mermaid codec around Pele with stable node and edge IDs, readable labels, and explicit errors for syntax the editor cannot round-trip. Verify the SQL backfill produces the same representation the application reads and writes.
- [x] Move canvas saves and MCP to the document service. Keep the canvas, inspector, validation and insights. Replace node and edge routes, layout and validation routes, and their ten MCP tools with `processflow_list`, `processflow_get`, `processflow_create`, `processflow_update`, and `processflow_delete`.
- [x] Rehearse the migration with old rows on local Supabase. Run database, unit, integration, and local Playwright tests. Cover legacy data parity, an existing embed token, edits in both directions, and stale revision conflicts.
- [x] Address review findings. Validate known canvas metadata fields and the derived graph before saving, preserve unknown legacy fields, avoid overlaps when placing new nodes beside saved positions, reject edge animation directives, and use Pele's exported `FlowchartModel` instead of duplicate parser types.

## Local verification

- Applied migration 013 over schema 012 with two seeded legacy flows. The parsed documents matched the archived rows, including all six node types, all four edge types, parallel edges, exact positions, and escaped labels. A v1 signed link opened the migrated flow.
- Passed all 19 Playwright tests, 22 Supabase integration tests, 431 unit tests, database permissions tests, schema lint, TypeScript, and Biome.

## Editable source

Use `flowchart` or `graph` with an explicit direction, plain-text labels, standard shapes, and directed arrows. BeemSpec adds missing edge IDs on save. Keep existing node and edge IDs to retain their metadata. The editor rejects unsupported constructs such as subgraphs and styling.

## Deployment and recovery

Pause process-flow writes while applying the migration and switching to the new app. Take a database backup before deploying. The protected archive records the pre-cutover graph. Restore it only before accepting document writes. Afterward, back up the new documents and verify a reverse conversion of the latest revisions before rolling back the old app.

After the recovery window, remove the private archive through a separate migration.
