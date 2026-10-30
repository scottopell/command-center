# ADR-007: Define the visual latency measurement before choosing warmup

- **Status:** Accepted
- **Date:** 2026-10-29
- **Affects:** REQ-SH-004, REQ-SH-006, REQ-FF-009

## Context

The agreed visual SLO is a destination view or destination-specific loading state within 500 ms, with input capture independent of data readiness. Cold application startup and service response time are different observations. The experiment must record its machine and workload; it does not need a second invented latency target for capture, whose requirement is continuous ownership from command admission.

## Options considered

- Require every OS scheduling circumstance to meet a hard deadline: not a controllable application guarantee.
- A foreground running-app benchmark profile, with every observed miss reported rather than hidden in an average.
- Relax the requirement to a percentile or exclude first invocation: less demanding but not user-approved.

## Decision

Keep the 500 ms running-app visual requirement. Use the awake development Mac, a running single-window app and normal desktop workload as the initial profile. Record native loading-frame flush separately from resolution/handoff. Include first function launches, warm repetitions, rapid cancel/relaunch and screen captures. Report every observed miss, not only averages. Cold app startup remains a separate observation.

## Consequences

### Positive

The SLO constrains the implementation without pretending data loading must finish within 500 ms.

### Negative

Measurements on one hardware/load profile cannot establish a deadline under arbitrary operating-system stalls. The profile and every observed miss must be reported.

### Neutral

SLOW intentionally delays resolution while still obeying shell loading-state and input-capture behavior.

## References

[Shell requirements](../shell/requirements.md); [framework requirements](../function-framework/requirements.md).

## Experiment and acceptance

Record the development Mac, macOS/app build, foreground state, and a reproducible workload for the run. Measure command admission to visible loading/view frame, continuous input ownership, commit/focus/handoff, and Escape response separately. Record raw samples and failures. No user decision about an extra input-capture millisecond threshold is required. Do not accept a runtime optimization solely from an average timing.

## Implementation evidence (2026-10-29)

See the [application verification record](../../verification/README.md), [raw native samples](../../verification/native-benchmark.json), and [screen smoke checks](../../verification/screen-smoke.json). Thirty native launch/dispose cycles released all weakly tracked invocation/view objects; three cycles allocated 32 MiB document-owned blobs. Screen samples are conservative upper bounds including automation/capture overhead. These local checks do not establish performance under arbitrary OS stalls, exact GC/RSS timing, or exhaustive interleaving coverage.
