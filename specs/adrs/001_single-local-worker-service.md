# ADR-001: Route application operations through one local service

- **Status:** Accepted
- **Date:** 2026-10-29
- **Affects:** REQ-BW-001, REQ-BW-002, REQ-BW-003, REQ-BW-005, REQ-BW-006, REQ-BW-007, REQ-BW-010, REQ-BW-011

## Context

Coding agents need DRQS while the command-center window is closed. Functions need backend application logic without each implementing HTTP. The requested scope is local request/response handling rather than an autonomous job executor.

## Options considered

- Backend inside each UI invocation: small initially, but disappears with Escape and retains UI lifetime concerns.
- One service per Function Worker: independent processes, but multiplies activation, ports, deployment and discovery.
- One platform service with built-in worker registrations and local persistence: central transport, small worker definitions.

## Decision

Use one per-user local HTTP service with a single POST /rpc envelope { function, operation, input }. A Function Worker registers named operations with an input schema and handler. Unknown identifiers are rejected before dispatch. The schema is the source of runtime validation and TypeScript client/handler types. Use a single SQLite database with worker-owned tables and platform-provided transaction access; expose application operations rather than a generic public database API. Use a local bearer credential stored in a user-only file for native and CLI clients. Bind loopback only; do not expose that credential to page content. The native bridge proxies authorized view calls. Register trusted built-ins at service startup. No plugin upload, RPC version negotiation, job scheduler, retry queue, or remote listener is included.

## Consequences

### Positive

One transport and one set of validation rules serve UI and agent clients. Local transactions support simple unique ticket allocation.

### Negative

A worker bug can affect the shared service. SQLite access must remain worker-scoped by convention and API rather than a hostile-code sandbox.

### Neutral

Function Worker is an application module, not a promise of a dedicated thread or process. The service can run continuously or activate on demand.

## References

[Worker requirements](../function-workers/requirements.md).

[ADR-009](009_worker-store-and-retry-boundaries.md) refines worker-facing storage to a scoped KV interface, keeping SQLite and table layout private to the platform.
