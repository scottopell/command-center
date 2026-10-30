# Shared architecture decision records

All feature specs share this one chain. Accepted records explain agreed decisions; Proposed records identify experiments or user decisions still required.

| ADR | Status | Decision |
| --- | --- | --- |
| [ADR-000](000_native-shell-and-function-contract.md) | Accepted | Native shell and narrow function contract |
| [ADR-001](001_single-local-worker-service.md) | Accepted | One listener, workers, and local transactions |
| [ADR-002](002_runtime-isolation-and-warmup.md) | Accepted | Disposable WebViews; no prewarmed pool needed by the local profile |
| [ADR-003](003_service-activation.md) | Accepted | Always-running per-user launchd service; socket activation deferred |
| [ADR-004](004_loading-input-fidelity.md) | Accepted | Limited loading-time editing; submission after readiness |
| [ADR-005](005_bounded-unload.md) | Accepted | Discard transient state; no custom unload or exit-data persistence |
| [ADR-006](006_independent-drqs.md) | Accepted | Fresh local DRQS journeys |
| [ADR-007](007_latency-profile.md) | Accepted | Recorded local visual/input profile and measurement limits |
| [ADR-008](008_focus-dependent-cancel.md) | Accepted | Escape returns command focus; Escape in the command bar cancels |
| [ADR-009](009_worker-store-and-retry-boundaries.md) | Accepted | Worker-facing KV store; request and internal retry boundaries |
| [ADR-011](011_retained-navigation-and-queries.md) | Accepted | Retained Back, invocation queries, broad invalidation and explicit consistency limits |
| [ADR-012](012_selection-copy-and-sibling-browsing.md) | Accepted | Display selection copy and stable sibling replacement without restoration |
| [ADR-013](013_command-display-and-inline-discovery.md) | Accepted | Retain launch command, remove examples, add inline discovery |
| [ADR-014](014_public-project-groups.md) | Accepted | Authored project routing groups and an explicit Inbox |
| [ADR-015](015_build-time-function-composition.md) | Accepted | Explicit build-time function composition from an optional local checkout |
| [ADR-016](016_reproducible-local-verification.md) | Accepted | Pinned build inputs, preflight and isolated packaged-runtime verification |

## Task routing

- Function authoring and focus handoff: ADR-000, ADR-004, ADR-005, ADR-008.
- Runtime ownership and latency: ADR-002, ADR-007.
- Worker transport, storage and startup: ADR-001, ADR-003, ADR-009.
- DRQS domain behavior: ADR-006, ADR-014.
- Retained Back and query integration: ADR-011.
- Selection copying and sibling traversal: ADR-012.

## Dependencies

ADR-002 depends on ADR-000, ADR-004, ADR-005, and ADR-007. ADR-003 implements the lifecycle choice permitted by ADR-001. ADR-006 depends on ADR-000 and ADR-001.

ADR-008 clarifies the Escape trigger associated with ADR-005 and the focus handoff in ADR-000.
