# stragglers — Executive Summary

## Requirements Summary

Track slow framework screen transitions without conflating application-data latency or recording operator drafts.

## Technical Summary

See [ADR-017](../adrs/017_runtime-packs-and-transition-diagnostics.md). Native monotonic measurements and bounded asynchronous recording feed the normal STRAG function and offline CLI.

## Status Summary

| Requirement | Status | Notes |
| --- | --- | --- |
| **REQ-ST-001:** Measure a framework-owned responsiveness checkpoint | ✅ Complete | Deterministic detector, bounded history/CLI and actual WebKit STRAG checks. |
| **REQ-ST-002:** Detect stragglers without canceling | ✅ Complete | Deterministic detector, bounded history/CLI and actual WebKit STRAG checks. |
| **REQ-ST-003:** Persist bounded diagnostic evidence | ✅ Complete | Deterministic detector, bounded history/CLI and actual WebKit STRAG checks. |
| **REQ-ST-004:** Inspect history through a normal function | ✅ Complete | Deterministic detector, bounded history/CLI and actual WebKit STRAG checks. |

**Progress:** 4 of 4 complete.

## Open Questions & Future Directions

- Exact pixel presentation, automatic reproduction and detailed CPU profiling remain deferred.
