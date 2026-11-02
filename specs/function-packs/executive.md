# function-packs — Executive Summary

## Requirements Summary

Independent local functions and observable screen transitions without rebuilding the native host.

## Technical Summary

See [ADR-017](../adrs/017_runtime-packs-and-transition-diagnostics.md). The host builds and activates local packs independently; conformance evidence is mapped in verification/requirements.json.

## Status Summary

| Requirement | Status | Notes |
| --- | --- | --- |
| **REQ-PK-001:** Add an existing source folder | ✅ Complete | Native folder picker, manifest validation and explicit registration. |
| **REQ-PK-002:** Build independent installed artifacts | ✅ Complete | Per-function bundles and worker artifacts survive source removal; compiler rejects unsupported inputs. |
| **REQ-PK-003:** Own the supported SDK and toolchain | ✅ Complete | Packaged SDK/compiler, local schema-derived types and static guards. |
| **REQ-PK-004:** Reject identity and mnemonic conflicts | ✅ Complete | Collision tests and stable storage-identity isolation. |
| **REQ-PK-005:** Build changes and apply manually | ✅ Complete | Watched, coalesced builds with visible candidate status and manual Apply. |
| **REQ-PK-006:** Apply as a bounded maintenance operation | ✅ Complete | Admission/drain tests include disconnected clients and deadline postponement. |
| **REQ-PK-007:** Activate matching code and contracts | ✅ Complete | Exact-generation readiness, stale-revision refusal and injected startup-failure recovery. |
| **REQ-PK-008:** Relaunch an affected open function | ✅ Complete | Actual WebKit Apply & Relaunch drops tail/draft and retains an unrelated invocation. |
| **REQ-PK-009:** Remove code while retaining data | ✅ Complete | Removal retains records; native-only purge requires removal first. |
| **REQ-PK-010:** Keep system dependencies explicit | ✅ Complete | One explicit host-wired read-only STRAG dependency; folder system identity refused. |

**Progress:** 10 of 10 complete.

## Open Questions & Future Directions

- Managed acquisition and additional runtime optimizations remain deferred.
