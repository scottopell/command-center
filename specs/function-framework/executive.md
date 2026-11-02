# Function authoring framework — Executive summary

## Requirements summary

As a function author, I need a narrow lifecycle contract and ordinary web controls so that I can implement useful functions without rebuilding input routing or rendering infrastructure.

## Technical summary

[ADR-000](../adrs/README.md) records the TypeScript/React-facing loader-to-view contract. The framework supplies lifecycle plumbing, not a control library. [ADR-011](../adrs/011_retained-navigation-and-queries.md) adds typed retained screens and shared invocation queries without a reconstruction state API. [ADR-005](../adrs/005_bounded-unload.md) removes custom unload hooks and temporary exit-data persistence. Normal React cleanup and host disposal release resources; saved application data belongs to workers. SLOW is a conformance fixture, not a separate product or background job engine. [ADR-002](../adrs/002_runtime-isolation-and-warmup.md) selects disposable WebViews without a warm pool, based on the local latency and retention checks.

## Status summary

| Requirement | Status | Notes |
| --- | --- | --- |
| **REQ-FF-001:** Define a function with a narrow contract | ✅ Complete | Entry-scoped lifecycle/query integration and native handoff verified. |
| **REQ-FF-002:** Prepare the screen without waiting for application data | ✅ Complete | Entry-scoped lifecycle/query integration and native handoff verified. |
| **REQ-FF-003:** Declare initial focus without a readiness callback | ✅ Complete | Entry-scoped lifecycle/query integration and native handoff verified. |
| **REQ-FF-004:** Request per-invocation unload cleanup | N/A | Deprecated; historical obligation retained. |
| **REQ-FF-005:** Bound temporary preservation | N/A | Deprecated; historical obligation retained. |
| **REQ-FF-006:** Keep invocation data from escaping its lifetime | ✅ Complete | Entry-scoped lifecycle/query integration and native handoff verified. |
| **REQ-FF-007:** Use ordinary application controls | ✅ Complete | Implemented; code and checks are mapped in the verification record. |
| **REQ-FF-008:** Share validated worker clients | ✅ Complete | Entry-scoped lifecycle/query integration and native handoff verified. |
| **REQ-FF-009:** Exercise the lifecycle with SLOW | ✅ Complete | Implemented; code and checks are mapped in the verification record. |
| **REQ-FF-010:** Enforce supported application-data access | ✅ Complete | Actual WebKit outbound/resource refusal and typed bridge integration verified. |
| **REQ-FF-011:** Compose functions at build time | N/A | Deprecated; historical obligation retained. |
| **REQ-FF-012:** Verify a clean local build | ✅ Complete | Pinned runtime/dependencies, verified native tool, preflight, packaged-worker smoke and native verification pass on arm64. |

**Progress:** 9 of 9 active requirements complete; 3 deprecated requirements retained.

Implementation evidence: [code, tests and measurement scope](../../verification/README.md).

## Open questions & future directions

- The standalone SDK is distributed with the host toolchain; publishing it separately remains optional.
- Local folder packs use SDK 1.0.0. Cross-version negotiation and arbitrary embedded web apps remain deferred.
