# INTEGRATION_CONTRACTS.md

This document captures the minimum official integration contract for BeemSpec Phase 2/3 work so we do not rely on assumed or undocumented APIs.

## Scope

- Linear: issue sync, auth, webhooks, rate-limit behavior.
- OpenCode: plugin packaging, hooks, event lifecycle handling, custom tools.
- Rule: if behavior is not documented in official sources below, treat it as unsupported until verified.

## SDK-First Policy

- Prefer official SDKs for integration implementations when available and stable.
- Allow direct HTTP only when an SDK does not exist, lacks required functionality, or has blocking stability issues.
- Record any SDK bypass decision in an ADR or this contract doc with rationale.

## Canonical Sources

### Linear

- GraphQL API: https://linear.app/developers/graphql
- TypeScript SDK: https://linear.app/developers/sdk
- SDK source: https://github.com/linear/linear/tree/master/packages/sdk
- Webhooks: https://linear.app/developers/webhooks
- OAuth/auth: https://linear.app/developers/oauth-2-0-authentication
- Rate limits: https://linear.app/developers/rate-limiting
- Deprecations: https://linear.app/developers/deprecations
- GraphQL schema explorer: https://studio.apollographql.com/public/Linear-API/schema/reference?variant=current
- Webhooks schema explorer: https://studio.apollographql.com/public/Linear-Webhooks/variant/current/schema/reference/objects

### OpenCode

- SDK overview: https://opencode.ai/docs/sdk/
- Plugins: https://opencode.ai/docs/plugins/
- Custom tools: https://opencode.ai/docs/custom-tools/
- Config: https://opencode.ai/docs/config/
- Plugin type surface (authoritative for hook signatures):
  - https://github.com/anomalyco/opencode/blob/dev/packages/plugin/src/index.ts

## Linear Contract (Minimum)

### Transport and auth

- GraphQL endpoint: `https://api.linear.app/graphql`.
- OAuth authorize endpoint: `https://linear.app/oauth/authorize`.
- OAuth token endpoint: `https://api.linear.app/oauth/token`.
- Local runtime config for Phase 3 slice 1: `LINEAR_API_KEY` (fallback `BEEMSPEC_LINEAR_API_KEY`).
- Webhook signing config: `BEEMSPEC_LINEAR_WEBHOOK_SECRET` (fallback `LINEAR_WEBHOOK_SECRET`).
- Outbound target config source: team-scoped `integration_settings` row (`linear_team_id`, `linear_project_id`, `linear_state_id`).
- Inbound conflict policy: code-defined latest-write-wins using provider/object update timestamps.
- Auth headers:
  - OAuth bearer: `Authorization: Bearer <ACCESS_TOKEN>`
  - Personal key: `Authorization: <API_KEY>`

### Operations to support first

- Use official SDK methods first:
  - `issue(id)`
  - `createIssue(input)`
  - `updateIssue(id, input)`
- Keep mapping aligned with provider-documented model fields (`id`, `identifier`, `title`, `description`, `stateId`, `updatedAt`).

### Error model

- GraphQL may return HTTP 200 with `errors`; always inspect `errors[]`.
- Treat `errors[].extensions.code === "RATELIMITED"` as retryable.

### Webhooks

- Webhook endpoint must be publicly reachable HTTPS.
- Must return HTTP `200` quickly (Linear docs note timeout behavior and retries).
- Verify `Linear-Signature` using HMAC-SHA256 over the raw request body.
- Validate timestamp fields (`webhookTimestamp`) against an allowed drift window.
- Handle retry and idempotency using delivery identifiers such as `Linear-Delivery` and/or webhook object ids.
- Persist delivery idempotency receipts with a unique key to prevent double-apply on retries.
- Resolve field conflicts with code-defined latest-write-wins using object update timestamps (`issue.updatedAt` vs local `updated_at`).
- Provide a manual reconciliation path to converge drift when webhook/outbound delivery is missed.
- Provide a batch reconciliation path for periodic drift correction on the main machine runtime.
- Optional machine trigger auth for batch reconcile via `BEEMSPEC_RECONCILE_CRON_TOKEN` bearer token.
- Key documented headers include:
  - `Linear-Delivery`
  - `Linear-Event`
  - `Linear-Signature`

### Rate limiting

- Respect response rate-limit headers (`X-RateLimit-*` families).
- Do not hardcode static limits as a single source of truth.
- Retry with backoff/jitter when rate-limited.

## OpenCode Plugin Contract (Minimum)

### Packaging and load model

- Plugin package target: `packages/opencode-beemspec`.
- Current repo includes scaffold contracts/factory under `packages/opencode-beemspec/src`.
- Local plugin paths:
  - project: `.opencode/plugins/`
  - global: `~/.config/opencode/plugins/`
- npm plugin loading is supported via `opencode.json` `plugin` list.
- Hooks run sequentially in documented load order.

### Hook/event surface to implement first

- `experimental.session.compacting`
- `experimental.chat.system.transform`
- `event` handler with allowlist:
  - `session.created`
  - `session.updated`
  - `session.idle`
  - `session.error`

### Custom tools

- Implement via `@opencode-ai/plugin` `tool(...)`.
- First tools only:
  - `beemspec_story`
  - `beemspec_blocked`
- Validate args with explicit schema and fail closed on malformed input.

## Stability and Versioning Caveats

- Linear GraphQL is schema-evolving; rely on schema/deprecation signals and changelog.
- OpenCode `experimental.*` hooks may change; treat as unstable API.
- Pin `@opencode-ai/plugin` to a tested version before rollout.
- Guard experimental hooks behind feature flags so runtime can degrade gracefully.

## Build Rules (Anti-Hallucination)

- Use only operations, fields, headers, and hook names confirmed in official docs/schema/type surfaces.
- Reject unknown payload fields during parse/validation.
- Make idempotency explicit for webhook and sync handlers.
- Keep retry policy data-driven from real error codes/headers.
- Prefer typed clients/generated types where available; avoid stringly-typed ad hoc payloads.

## Phase 2 Deliverables Enabled by this Contract

- Integration interfaces/stubs can be created without DB migration work.
- ADRs can reference this contract as source for API/hook assumptions.
- Test doubles can mirror documented field names and error modes only.
