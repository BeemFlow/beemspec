# Integrations

Integrations are application-owned vertical slices. Keep provider-specific concepts inside the provider directory and share only proven, provider-neutral behavior.

## Current shape

```text
src/integrations/
  conflict.ts                 # provider-neutral timestamp conflict rule
  linear/
    adapter/                  # Linear SDK, wire formats, mapping, and validation
    auth.ts                   # application auth/context resolution
    connections.ts            # persisted OAuth connection access
    jobs.ts                   # durable outbound queue worker
    reconcile.ts              # manual and queued reconciliation orchestration
    settings.ts               # effective team/map settings
    story-links.ts            # local-to-remote identity links
    story-sync.ts             # story synchronization use cases
  mcp/
    server.ts                 # transport and explicit tool composition
    tool-support.ts           # shared results, validation, and lookup helpers
    insights/                 # story-map and process-flow guidance builders
    tools/                    # registrations grouped by product domain

src/components/integrations/
  linear/                     # Linear-specific settings UI and hooks
```

The Linear SDK must only be imported from `src/integrations/linear/adapter`. Routes and UI call application modules or adapter exports; they do not instantiate the SDK directly.

## Adding another provider

Add a sibling vertical slice such as `src/integrations/github-projects` only when the provider is implemented. A complete provider normally includes:

1. An adapter containing its SDK/API client, webhook verification, validation, and provider-to-story mapping.
2. Application orchestration for credentials, effective settings, story links, conflict handling, retries, and reconciliation.
3. Provider-specific API routes for OAuth, configuration, webhooks, and manual sync.
4. Provider-specific UI under `src/components/integrations/<provider>` that is explicitly composed into existing settings screens.
5. A durable queue path for outbound work when saving should not wait on the provider.
6. Unit tests for mapping and orchestration, integration tests for persistence, and route/E2E coverage for the user flow.

Do not add a registry or generic provider interface in anticipation of future integrations. Extract shared code only after at least two providers demonstrate the same stable behavior. Keep provider fields out of generic contracts when their meaning is provider-specific.
