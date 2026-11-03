# ADR-019: Apply the transition budget only while foreground and visible

Date: 2026-11-03

Status: Accepted

Affects: REQ-ST-001, REQ-ST-002, REQ-ST-004

## Context

WebKit can stop animation-frame callbacks for hidden windows. ADR-017 allowed a queued-task fallback; its implementation waited 100 ms before substituting that path. The minification experiment exercised this fallback exclusively, mixing deliberate waiting with startup time and using different readiness evidence for visible and hidden views.

## Options considered

- Keep the fallback and classify its timings: preserves background readiness but retains two readiness paths and an arbitrary timer.
- Pause and resume a foreground-only clock: excludes background delays but needs interval accounting and yields a fragmented timing definition.
- Exclude interrupted measurements and use one readiness path: retains a simple elapsed clock and one eligibility flag, at the cost of delayed readiness while hidden.

## Decision

Choose the third option. AppKit application activity and window occlusion determine eligibility. Capture their initial state and observe application deactivation and window occlusion changes. Eligibility can be lost but never restored for that transition. Check current visibility at deadline and completion as well. Do not withdraw an already-detected straggler.

Remove the timer fallback. All readiness acknowledgments follow an animation-frame callback and a separately queued task. Background functions may prepare and fetch data but need not acknowledge readiness until rendering resumes. Normal command-focus behavior is unchanged.

Record raw durations and eligibility for every transition. STRAG and offline CLI exclude ineligible records from the SLO denominator and maxima, show their count, and retain access to their detail. Existing records keep their recorded classifications; no heuristic migration is performed.

This supersedes only ADR-017's fallback and unconditional budget policy; its other decisions stand.

## Consequences

The operator gets a foreground latency metric without background scheduling noise, another timer, or pause/resume accounting. Switching away excludes that measurement even if the function was also slow. A background view may remain in loading/input-capture state until the operator returns. Foreground WebKit integration tests and benchmarks need an active, unoccluded desktop window; they cannot claim readiness results from hidden windows.

## References

- [Transition requirements](../stragglers/requirements.md)
- [ADR-017](017_runtime-packs-and-transition-diagnostics.md)
- `TransitionMeasurement`, `Shell.beginMeasurement`, `diagnosticsReader`
