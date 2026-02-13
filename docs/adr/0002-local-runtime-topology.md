# ADR 0002: Local Runtime Topology (Main Machine)

## Status

Accepted

## Context

BeemSpec runs on a main machine today. We need a topology that supports reliable orchestration while staying simple and aligned with current infra decisions.

## Decision

- Run Next.js app as the control plane (`next start`).
- Keep Supabase as durable state and recovery source.
- Start with in-app background worker loop for orchestration tasks.
- Keep worker logic idempotent and resume-safe after restart.

## Consequences

- Deployment remains single-runtime and easy to operate locally.
- Recovery is DB-driven: pending jobs are resumed from persisted state.
- Future sidecar worker split remains possible without changing domain interfaces.
