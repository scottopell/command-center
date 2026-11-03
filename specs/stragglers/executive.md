# stragglers — Executive Summary

## Requirements Summary

Track slow framework screen transitions without conflating application-data latency or recording operator drafts.

## Technical Summary

See [ADR-017](../adrs/017_runtime-packs-and-transition-diagnostics.md) and [ADR-019](../adrs/019_foreground-transition-budget.md). Native monotonic measurements and bounded asynchronous recording feed the normal STRAG function and offline CLI. The foreground budget uses permanent visibility eligibility; hidden views await the single frame-based readiness path.

## Status Summary

| Requirement | Status | Notes |
| --- | --- | --- |
| **REQ-ST-001:** Measure a framework-owned responsiveness checkpoint | ✅ Complete | Real SDK controlled-frame test passes without a timer fallback; foreground conformance suite requires a visible test host. |
| **REQ-ST-002:** Detect stragglers without canceling | ✅ Complete | Permanent eligibility, notification wiring and retained misses pass deterministic native checks. |
| **REQ-ST-003:** Persist bounded diagnostic evidence | ✅ Complete | Deterministic detector, bounded history/CLI and actual WebKit STRAG checks. |
| **REQ-ST-004:** Inspect history through a normal function | ✅ Complete | History/CLI exclude background records from the SLO counts/maxima; live STRAG shows exclusions separately. |

**Progress:** 4 of 4 complete.

## Open Questions & Future Directions

- Exact pixel presentation, automatic reproduction and detailed CPU profiling remain deferred.
