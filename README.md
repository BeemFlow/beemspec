# BeemSpec

BeemSpec is a story-mapping and release-planning tool. It is currently focused on helping teams define product scope clearly before execution.

## Current product scope

- Story map management with activities, tasks, stories, and release slicing.
- Team-based collaboration with authentication, team switching, and member invites.
- Drag-and-drop map interactions for reordering and moving work across the board.
- Story detail capture for requirements, acceptance criteria, design links, edge cases, and technical notes.
- Personas are intentionally deferred from the active UI flow until post-hardening product validation.

## Product direction

BeemSpec is being built as the planning source of truth.

- BeemSpec: planning context (`what` and `why`).
- Linear: execution coordination (`when` and `who`) - planned, not yet implemented.
- OpenCode: implementation runtime - planned, not yet implemented.

Near-term focus is hardening and polishing the Story Map experience for daily dogfooding before building integrations.

## Integration feature flags

- `BEEMSPEC_ENABLE_LINEAR`: enables Linear integration ports.
- `BEEMSPEC_ENABLE_OPENCODE`: enables OpenCode plugin/runtime ports.
- `BEEMSPEC_ENABLE_RELEASE_RUNNER`: enables release-runner orchestration port.

Linear outbound sync (Phase 3 slice 1) also requires an API key:

- `LINEAR_API_KEY` (preferred)
- `BEEMSPEC_LINEAR_API_KEY` (fallback)

Story-triggered outbound sync uses default target settings:

- `BEEMSPEC_LINEAR_DEFAULT_TEAM_ID` (required for auto-create on story create)
- `BEEMSPEC_LINEAR_DEFAULT_PROJECT_ID` (optional)
- `BEEMSPEC_LINEAR_DEFAULT_STATE_ID` (optional)

Implementation note: Linear integration uses the official SDK (`@linear/sdk`) for issue read/create/update operations.
