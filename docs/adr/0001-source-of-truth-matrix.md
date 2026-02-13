# ADR 0001: Source-of-Truth Matrix

## Status

Accepted

## Context

BeemSpec plans product work, while execution tracking and implementation runtime belong to other systems. Without an explicit source-of-truth boundary, fields drift and conflicts become hard to resolve.

## Decision

Use this ownership matrix.

| Domain | BeemSpec | Linear | OpenCode |
| --- | --- | --- | --- |
| Story intent (`what`, `why`) | Source of truth | Mirror subset | Read-only context |
| Execution coordination (`who`, workflow state) | Optional mirror only | Source of truth | Read-only context |
| Agent session execution state | Summary view only | Optional link | Source of truth |
| Release scope (stories selected for release) | Source of truth | Derived from linked issues | Read-only context |
| Blocking/error annotations for planning | Source of truth | Optional mirror | Producer of signal |

## Consequences

- Story intent fields should not be overwritten by Linear webhook updates.
- Linear workflow state may be mirrored into BeemSpec but not authored there by default.
- OpenCode lifecycle events are consumed as status signals, not as planning-authoritative data.
