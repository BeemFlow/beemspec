# ADR 0003: Idempotency and Retry Policy

## Status

Accepted

## Context

Linear webhooks, outbound sync calls, and release orchestration are all failure-prone under network and provider constraints. We need deterministic retry behavior before full integration build.

## Decision

- Use at-least-once processing with explicit idempotency keys.
- Webhook ingestion:
  - verify signature and timestamp before processing
  - deduplicate by delivery key
- Outbound sync:
  - retry only transient failures (rate-limit, 5xx, network)
  - do not retry validation/auth failures without operator action
- Backoff strategy:
  - exponential backoff with jitter
  - cap attempts and persist final failure reason for manual retry

## Consequences

- Duplicate deliveries do not create duplicate writes.
- Retries are predictable and observable.
- Manual intervention path exists for hard failures.
