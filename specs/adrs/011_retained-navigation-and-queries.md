# ADR-011: Retained navigation and invocation-scoped worker queries

Date: 2026-10-30

Status: Accepted

Affects: REQ-NV-001, REQ-NV-002, REQ-NV-003, REQ-NV-004, REQ-NV-005, REQ-NV-006, REQ-NV-007, REQ-NV-008, REQ-NV-009, REQ-QL-001, REQ-QL-002, REQ-QL-003, REQ-QL-004, REQ-QL-005, REQ-QL-006, REQ-QL-007, REQ-QL-008, REQ-QL-009, REQ-FF-001, REQ-FF-002, REQ-FF-003, REQ-FF-006, REQ-FF-008, REQ-FF-010

## Context

Functions use local list/detail transitions without consistent Back. The operator wants retained filters, drafts, selection, scroll and focus while owner data reflects committed changes. Reconstruction would require authors to classify and preserve state; retaining only a top-N subset would make Back depend on depth. Existing apps remain canonical owners.

## Options considered

- Reconstruct screens from explicit entry models: smaller retained DOM, but a second state API and incomplete restoration risk.
- Retain a top-N subset: bounded retention at the cost of two Back semantics and reconstruction machinery.
- Retain a bounded stack of ordinary React screens with a query client: consistent behavior and ordinary state, with memory/effect observability obligations.

## Decision

Retain up to four entries per invocation with React Activity. Back belongs to the framework; root Back is disabled; direct detail launches have no fabricated history. Functions choose push versus replace and declare typed destinations. Native Back sits in the function area with Command-[. Command-focus Back preserves the command and defers function focus; a pointer Back explicitly resumes the function.

Use TanStack Query in a disposable per-invocation provider. Defaults: gcTime Infinity, staleTime zero, retries disabled, no polling, no automatic window/reconnect triggers. Query identity uses registered worker/operation/validated input. Confirmed mutation invalidates the whole invocation cache. No app-specific cache patches, normalized entity model or per-author invalidation callbacks. Late cancelled read deliveries are ignored at the client; owner operations need no new cancel protocol.

Unknown attempts stay blocked and are not resolved by one record refresh. Fresh invocation is a new intent without deduplication. No universal idempotency key or optimistic concurrency protocol is added. Current narrow status/field commands use last committed command wins; future replacement editors need owner-supported version checks. Relaunch is a fresh snapshot, not a barrier to old admitted work.

Enforce supported application-data access through worker query/mutation integration, browser resource/connection policy and native document guards. Swift retains shell/input/transport responsibilities. External data ownership migration, streams, persistent navigation, offline caches and process-death restoration remain separate work.

## Consequences

Positive: ordinary React state survives Back; owner refresh stays generic; no state serializer or custom cache engine.

Negative: inactive query variants and DOM remain until invocation disposal, so diagnostics must include query count as well as stack depth. Back can reveal stale content briefly while owner reads finish. Unknown writes can require manual owner investigation. Hidden DOM resources still need normal effect cleanup.

Neutral: finite stack depth is a measurable product constraint; query-check and source freshness times remain distinct. The existing initial command loading/handoff guarantees apply to internal entry resolution as well.

## References

- [Navigation](../navigation/requirements.md), [queries](../query-layer/requirements.md), [worker semantics](../function-workers/requirements.md).
- [React Activity](https://react.dev/reference/react/Activity).
- [TanStack defaults](https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults), [query cancellation](https://tanstack.com/query/latest/docs/framework/react/guides/query-cancellation).
